// MODE 5'S OWN STATE MACHINE: the $96A5 ladder's arms, the five stage-intro
// states, and pause.
//
// src/nmi.js owns the frame; this file owns what the frame DISPATCHES INTO.
// The split is the ROM's: $9650 is the mode-5 entry and $96A5 is a bitfield
// ladder on $1B whose arms are five separate routines with five different
// tails, three of which re-enter the mode-5 body at a different instruction.
//
// ============================ WHAT $1B ACTUALLY IS ===========================
//
//   96A5  A9 10 / 25 1B / D0 24    bit 4 -> $96CF   next stage
//   96AB  A9 20 / 25 1B / D0 3E    bit 5 -> $96EF   DYING
//   96B1  A9 40 / 25 1B / D0 44    bit 6 -> $96FB   game over / continue
//   96B7  A5 1B / 10 03            bit 7 -> $982A   PLAY, low nibble dispatch
//   96BE  A2 03 / 86 0D / JSR $83E4  none -> $0D = 3 and the 5-entry table
//                                            at $96C5: the STAGE INTRO
//
// It is a LADDER, not a switch: $1B = $30 would take the bit-4 arm and never
// see bit 5. The port keeps that order and every arm it does not implement
// throws with the ROM address it would have reached, so a state the corpus has
// never produced cannot quietly become a no-op.
//
// ======================= THE INTRO IS NOT A 28-FRAME WAIT ====================
//
// MEASURED, both windows, this wave, with flowprobe.py exec hooks:
//
//   boot     "200:,10:S,130:"        $9B3E@283 $9BF0@284 $9C12@285 $9C1E@286
//                                    $9C24 x23 @287..309   $9C3C@309
//   respawn  "200:,10:S,190:,300:R"  $9B3E@614 ... $9C24 x23 @618..640
//
// so the intro is 27 mode-5 frames on BOTH, not 28 and not 26 -- and the wave
// plan's "respawn = 26 frames, the exit is data-dependent" is half right and
// half not. The exit IS data-dependent ($9C24 loops until $57 goes non-zero,
// there is no counter anywhere), but on stage 1 it always lands on the same
// number, and the reason is structural rather than lucky: $9B3E sets $3F AND
// $55 from the SAME byte ($24, the checkpoint) and clears $3E/$54/$58, so the
// terrain streamer's 16-bit lead is EXACTLY 0 at every intro, whichever
// checkpoint it is. From a zero lead the throttle at $9DA7 first refuses on the
// 85th block ($0180 = 384 px = three 128-px half-pages of 28 blocks each), and
// $9C24 emits four per frame: 84 blocks over frames 1..21, all four calls of
// frame 22 throttled, and frame 23 reads $57 and leaves.
//
// The loop shape still matters and is still what is ported, because a counter
// would be a coincidence dressed as a model. tests/flow.test.js drives it with
// a NON-zero starting lead and the phase ends early; a 23-frame counter cannot.
//
// ============================== WHAT IS NOT HERE =============================
//
// Named rather than silently absent, each as a throw carrying its ROM address:
//
//   $96CF  next stage        (INC $19 -- the port loads one stage's assets)
//   $96FB  game over.        $96FD gates both the timeout and START on $B0 --
//                             which is CHARACTERISED as of wave 8: it is pulse
//                             1's duration counter (src/sound.js), so the gate
//                             means "wait until the game-over jingle finishes".
//                             The arm is still a throw because the wave plan
//                             excludes game over and continue, not because the
//                             byte is a mystery.
//   $97F1  lives went negative -- the game-over arm $979D branches to. Still a
//          throw for the same reason; wave 5 ported everything above it.
//   $9A0E..$9904  the end-of-stage / boss chain, play sub-states $81-$8F
//   $9C5E  the pause-screen cheat, reached at $33 == $0A
//   $882C's 2304 PPU writes -- only its RAM side effects are reproduced
//
// $83AB / $EC1E WERE ON THAT LIST AND ARE NOT ANY MORE -- src/sound.js, wave 8.
// Three of this file's routines make sound requests and all three now do:
// $9BC9 and $9BED (stop all four channels), and $9AFA (the pause jingle $3B,
// which is the ONE sound the driver keeps playing while $15 is set).

import { u8, BTN } from './state.js';
import { cannedPacket, copyPacket } from './hudpackets.js';
import { stLives, stTopScore, stScore, stPowerBar } from './hud.js';
import { buildBlock } from './terrain.js';
import { stopAllSound, pauseSaveChannel, pauseRestoreChannel, soundRequest } from './sound.js';

/** `$18`, with the range the per-player arrays assume made explicit. */
function playerIndex(state) {
  const p = state.zp.player;                        // $9B62 LDX $18
  if (p !== 0 && p !== 1) {
    throw new Error(`$18 = ${p}: $9B64 reads $22,X and $9B72 reads $28,X; `
                  + `only 0 and 1 are player indices`);
  }
  return p;
}

/**
 * `$96BE` -- the stage-intro dispatch. Reached when NO bit of $1B is set.
 *
 *   96BE  A2 03     LDX #$03
 *   96C0  86 0D     STX $0D      <- EVERY intro frame re-arms the blank
 *   96C2  20 E4 83  JSR $83E4    -> jt_96C5, five entries
 *
 * `$0D = 3` here and then `$0D = 6` (state 0) or `$0D = 5` (state 4) inside the
 * handler, which is why the measured sequence is 6,3,3,3,5,5,... and not a
 * monotonic countdown. Note the ROM's dispatcher pulls its own return address,
 * so every handler's RTS returns to $80AD -- the whole of $9A5E-$9ACE is
 * skipped on an intro frame. No player, no enemies, no split, no $8898 tick and
 * no $9D83 gate; the intro calls the producers and $9D8E itself.
 */
export function introStep(state, res) {
  state.ppu.blank = 3;                              // $96BE/$96C0
  switch (state.substate) {                         // $96C2 -> jt_96C5
    case 0: introReset(state, res); break;          // $9B3E
    case 1: introPackets(state, res); break;        // $9BED -> $9BF0
    case 2: introHud(state, res); break;            // $9C12
    case 3: introMeter(state, res); break;          // $9C1E
    case 4: introTerrain(state, res); break;        // $9C24 -> $9C3C
    default:
      // $83E4 indexes jt_96C5 with (A*2)+1 and the table has five entries; $1B
      // is only ever 0..4 here because every arm INCs it and $9C3C leaves for
      // $80. A sixth value would read $96CF's opcodes as a pointer.
      throw new Error(`$96C2 JSR $83E4: $1B = ${state.substate} is past `
                    + `jt_96C5's five entries`);
  }
}

/**
 * `$979D` -- THE RESPAWN. Reached from `$96F3` when the death countdown `$4C`
 * reaches 0, and it runs `$9B3E` IN THE SAME FRAME.
 *
 *   979D  A6 18 / D6 20              DEC $20,X          one life gone
 *   97A1  A6 18 / A9 00              (LDX $18 again -- the ROM reloads it)
 *   97A5  A4 42 / F0 02 / A9 01
 *   97AB  95 22                      $22,X = ($42 ? 1 : 0)
 *   97AD  A5 19 / 95 26              $26,X = $19
 *   97B1  A5 3F / 29 0E / C9 08 / 90 02 / A9 08
 *   97BB  95 24                      $24,X = min($3F AND $0E, 8)  THE CHECKPOINT
 *   97BD  A5 1A / 95 28              $28,X = $1A
 *   97C1  B5 20 / 30 2C              $20,X negative -> $97F1, GAME OVER
 *   97C5  ...                        the two-player switch, on $0A
 *   97DB  86 18     STX $18
 *   97DD  A9 00 / 85 39 / 85 3A / 85 5D / 85 33 / 85 1B / 85 1C
 *   97EB  20 09 9C  JSR $9C09        $57 = 0, $5E = #$3F (an IMMEDIATE, not $3F)
 *   97EE  4C 3E 9B  JMP $9B3E        <- the stage intro, THIS frame
 *
 * MEASURED on "200:,10:S,190:,300:R", at the f614 sample: lives 3 -> 2,
 * $1B $A0 -> 1 (i.e. $9B3E has already run and INC'd it), $0100 2 -> 1,
 * $0D 6, $0120 1, $48 152 -> 0, playerX 174 -> 80, playerY 96, and
 * $22 = $24 = $26 = $28 = 0. `lag.dropAtGameFrame` reads 283 AND 614 -- the
 * respawn pays $882C's dropped NMI exactly like the boot does.
 *
 * THE CHECKPOINT FORMULA IS NOT EXERCISED BY THIS CORPUS: every death in it
 * happens with $3F = 0, so `min($3F AND $0E, 8)` is 0 whatever it is. What holds
 * it is tests/collision.test.js, replaying 00-recon-flow.md's own three
 * intervention rows ($3F poked to 3, 7 and $14 gave $24 = 2, 6 and 4).
 *
 * `$39` USED TO BE ON THAT LIST -- "cleared by $97DD and NOT modelled: it has no
 * reader on any path this port takes". The second half is still true and the
 * conclusion was wrong. It is the WARP FLAG, and wave 22 ported its producer:
 * `$AF7E INC $39`, four hatch kills at an even score digit. Its only reader
 * ($9937, inside the boss-page chain) is still a throw, so it is write-only
 * here -- which is precisely why the value has to be carried correctly now
 * rather than reconstructed by W27. See src/state.js zp39.
 *
 * `$5E` IS still that case -- `$9C09` writes it and the PRG contains no reader
 * at all (grep: two writers, $99B5 and $9C0F, zero readers).
 *
 * `$1C` USED TO BE ON THAT LIST and is real port state as of wave 8: it is the
 * background-music de-dupe byte `$839B` compares against, and clearing it HERE
 * is what makes the respawn's stage intro request the BGM again instead of
 * being de-duplicated into silence.
 *
 * RETURNS `true` for a normal respawn (the intro ran; the caller does NOT run
 * the mode-5 body) and `false` for GAME OVER ($97F1 ran; the caller MUST run
 * the mode-5 body, because $97F1 ends `JMP $9A5E`). Wave 24 ported $97F1.
 */
export function respawn(state, res) {
  const p = playerIndex(state);                     // $979D LDX $18
  state.lives[p] = u8(state.lives[p] - 1);          // $979F DEC $20,X
  // $97A3-$97AB: A is 0 or 1, NOT $42 itself. A meter cursor of 6 comes back as
  // 1, which is why $9B66's restore never returns a real cursor position.
  state.save22[p] = state.zp.meter !== 0 ? 1 : 0;   // $97A5/$97A7/$97A9/$97AB
  state.save26[p] = state.zp19;                     // $97AD/$97AF
  let cp = state.cam.hi & 0x0E;                     // $97B1/$97B3 AND #$0E
  if (cp >= 8) cp = 8;                              // $97B5/$97B7/$97B9
  state.save24[p] = cp;                             // $97BB STA $24,X
  state.save28[p] = state.zp1A;                     // $97BD/$97BF
  if (state.lives[p] & 0x80) {                      // $97C1/$97C3 BMI $97F1
    // $97F1: GAME OVER. MEASURED (wave 12, throwaudit.py): executes twice in
    // 27,400 cartridge frames, at game frames 3379 and 3967; each time $96FB
    // then runs for ~400 frames. Losing three lives is the default outcome of
    // playing, not an exotic state. Ported in wave 24 (was a throw).
    enterGameOver(state, res, p);                     // $97F1 (below)
    return false;                                     // $9827 JMP $9A5E -- caller runs body
  }
  // $97C5-$97DB, the two-player switch. With one player $0A = 1, so `AND #$02`
  // is 0 and X -- and therefore $18 -- is unchanged. Ported as the ROM has it
  // rather than skipped: playerIndex() above is what refuses a real switch.
  let x = state.zp.player;                          // $97C5 LDX $18
  const a = state.zp0A;                             // $97C7 LDA $0A
  if (x === 1) {                                    // $97C9/$97CB CPX #$01
    if (a & 0x01) x = 0;                            // $97CD/$97CF/$97D1
  } else if (a & 0x02) {                            // $97D5/$97D7
    x = 1;                                          // $97D9 LDX #$01
  }
  state.zp.player = x;                              // $97DB STX $18
  // ---- $97DD: six zero stores, then the intro -----------------------------
  state.zp39 = 0;                                   // $97DF STA $39 -- wave 22
  state.build.gate = 0;                             // $97E1 STA $3A
  state.spawn.z5D = 0;                              // $97E3 STA $5D
  state.zp33 = 0;                                   // $97E5 STA $33
  state.substate = 0;                               // $97E7 STA $1B
  state.zp1C = 0;                                   // $97E9 STA $1C
  clearAhead(state);                                // $97EB JSR $9C09
  introReset(state, res);                           // $97EE JMP $9B3E
  return true;
}

/**
 * `$97F1` -- the GAME-OVER ENTRY, reached from `$979D` when the last life is
 * gone (`$20,X` negative). Sets up the game-over screen and seeds the continue
 * timeout, then ends `JMP $9A5E` (the caller runs the mode-5 body).
 *
 *   97F1  A9 FE / E0 00 / F0 02 / A9 FD   mask := P1 ? $FE : $FD
 *   97F9  25 0A / 85 0A                   $0A &= mask (drop the dead player's bit)
 *   97FD  A9 C0 / 85 1B                   $1B := $C0 (game over: bits 6+7)
 *   9801  A5 09 / D0 ..                   $09 != 0 -> demo path (unported; throw)
 *   980E  A9 1C / 20 E8 85                canned packet $1C (the banner)
 *   9813  A5 18 / 69 31 / 9D EC 06        $06EC,X := $18 + $31 (a continue indicator)
 *   981B  20 AB 83                        stop all sound ($FC)
 *   981E  A9 AF / 20 1E EC                sfx $AF -- the game-over jingle (owns pulse 1)
 *   9823  A9 78 / 85 4C                   $4C := $78 (120-frame continue timeout)
 *   9827  4C 5E 9A                        JMP $9A5E
 *
 * The jingle `$AF` is what makes `$B0` (pulse 1's DUR) non-zero for ~277 frames,
 * which is the `$96FD` gate the game-over arm waits on. `$06EC` is inside the
 * $0500-$06FF collision-map page; it holds a per-player continue-screen byte.
 */
function enterGameOver(state, res, p) {
  const mask = p === 0 ? 0xFE : 0xFD;                // $97F1/$97F3/$97F5/$97F7
  state.zp0A = u8(state.zp0A & mask);                // $97F9 AND $0A / STA $0A
  state.substate = 0xC0;                             // $97FD/$97FF LDA #$C0 / STA $1B
  if (state.zp09 !== 0) {                            // $9801 LDA $09 / BEQ $980E
    throw new Error('$9805: demo/attract game-over ($09 != 0). $0D := 5, INC '
                  + '$0B, JMP $9C09 -- the demo game-over path is not ported '
                  + '(attract mode is out of scope).');
  }
  cannedPacket(state, res.hudPackets, 0x1C);         // $980E/$9810
  state.coll[0x1EC + p] = u8(p + 0x31);              // $9813-$9818 STA $06EC,X
  stopAllSound(state, res);                          // $981B JSR $83AB
  soundRequest(state, 0xAF);                         // $981E/$9820 JSR $EC1E (the jingle)
  state.zp4C = 0x78;                                 // $9823/$9825 STA $4C (120)
}

/**
 * `$9B3E` -- intro state 0. The big one: it wipes the game, restores the
 * player's saved state, loads the screen, and seeds the ship and both rings.
 *
 *   9B3E  A2 5A / A9 00 / 95 3D / CA / 10 FB    $3D-$97 := 0   (91 bytes)
 *   9B47  A2 7F / 9D 00 01 / 9D 00 03 / 9D 00 05 / 9D 80 05
 *                          / 9D 00 06 / 9D 80 06 / CA / 10 EB
 *   9B5E  A9 14 / 85 35     $35 = 20, the autofire reload
 *   9B62  A6 18 / B5 22 / 85 42        $42 := $22,X
 *   9B68  B5 24 / 85 3F / 85 55        $3F := $55 := $24,X   THE CHECKPOINT
 *   9B6E  B5 26 / 85 19                $19 := $26,X
 *   9B72  B5 28 / 85 1A                $1A := $28,X
 *   9B76  E6 1B                        INC $1B
 *   9B78  20 2C 88  JSR $882C          the full-screen load -- see below
 *   9B7B  A9 1E / 85 11 / A9 A8 / 85 10
 *   9B83  A9 01 / 8D 20 01             $0120 = 1, the level ship metasprite
 *   9B88  A4 19 / A5 3F / 4A / 18 / 79 CC 9B / A8      Y := $9BCC[$19] + $3F/2
 *   9B92  B9 D4 9B / 29 F0 / STA $0320 $0321 $0322     Y = byte AND $F0
 *   9BA0  A2 1F / 9D C0 07 / CA / 10 FA                and all 32 of $07C0
 *   9BA8  B9 D4 9B / ASL x4 / STA $0360 $0361 $0362    X = byte << 4
 *   9BB8  A2 1F / 9D A0 07 / CA / 10 FA                and all 32 of $07A0
 *   9BC0  A9 01 / 8D 00 01               $0100 = 1, the ship is alive again
 *   9BC5  A9 06 / 85 0D                  $0D = 6
 *   9BC9  4C AB 83  JMP $83AB            sound $FC: stop all four channels
 *
 * THE CLEAR IS THE POWER-UP WIPE. $3D-$97 covers $40 (speed), $41, $44, $45,
 * $46 -- everything a capsule ever gave you -- plus the camera, the streamer's
 * cursor, the HUD's rotation phase $48 and the whole spawn-engine zero page.
 * $42 survives only because $9B66 puts it back from $22,X, and $22,X is 0 or 1
 * ($97A5-$97AB), never the cursor's real value.
 *
 * WHAT THE PAGE CLEAR DOES *NOT* COVER, and it is not an oversight in this
 * port: `LDX #$7F` is 128 bytes, so $0100-$017F and $0300-$037F only. The
 * attribute-mask array at $0180 and the X sub-pixel accumulator at $0380
 * SURVIVE a respawn. Written out array by array below rather than as a range,
 * so the two that are missing are visible.
 */
export function introReset(state, res) {
  clearZeroPage(state);                             // $9B3E-$9B45
  // $9B47-$9B5C, X = $7F..0, six absolute-indexed stores per iteration.
  state.obj.status.fill(0);                         // $0100-$011F
  state.obj.anim.fill(0);                           // $0120-$013F
  state.obj.timer.fill(0);                          // $0140-$015F
  state.obj.animFrame.fill(0);                      // $0160-$017F
  state.ring.cursor = 0;                            // $0160 aliases animFrame[0]
  state.obj.type.fill(0);                           // $0300-$031F
  state.obj.y.fill(0);                              // $0320-$033F
  state.obj.yf.fill(0);                             // $0340-$035F
  state.obj.x.fill(0);                              // $0360-$037F
  state.coll.fill(0);                               // $0500-$06FF, four stores
  // NOT cleared, and that is the ROM: $0180 (attrMask) and $0380 (xf) onward.

  state.zp.autofire = 0x14;                         // $9B5E LDA #$14 / STA $35
  const p = playerIndex(state);                     // $9B62 LDX $18
  state.zp.meter = state.save22[p];                 // $9B64/$9B66
  state.cam.hi = state.save24[p];                   // $9B68/$9B6A  $3F
  state.build.hi = state.save24[p];                 // $9B6C        $55
  state.zp19 = state.save26[p];                     // $9B6E/$9B70  $19
  state.zp1A = state.save28[p];                     // $9B72/$9B74  $1A
  state.substate = u8(state.substate + 1);          // $9B76 INC $1B

  fullScreenLoad(state);                            // $9B78 JSR $882C

  state.ppu.mask = 0x1E;                            // $9B7B/$9B7D
  state.ppu.ctrl = 0xA8;                            // $9B7F/$9B81
  state.obj.anim[0] = 1;                            // $9B83/$9B85 STA $0120

  // $9B88-$9BBE. ONE table byte carries both coordinates: high nibble = Y,
  // low nibble = X/16. Stage 0 checkpoint 0 -> $9BD4[0] = $65 -> (80, 96),
  // which is where the cartridge put the ship at f283 and again at f614.
  const flow = res.flowTables;
  const y = u8(flow.read(0x9BCC + state.zp19) + (state.cam.hi >> 1));  // $9B8E
  const packed = flow.read(0x9BD4 + y);             // $9B92 LDA $9BD4,Y
  const py = packed & 0xF0;                         // $9B95 AND #$F0
  const px = u8(packed << 4);                       // $9BAB-$9BAE ASL x4
  state.obj.y[0] = state.obj.y[1] = state.obj.y[2] = py;    // $9B97-$9B9D
  state.obj.x[0] = state.obj.x[1] = state.obj.x[2] = px;    // $9BAF-$9BB5
  // $9BA2 and $9BBA write 32 bytes each ($07C0-$07DF, $07A0-$07BF). The port's
  // rings are the 24 the ROM's own `CMP #$18` at $A08C walks; $07B8-$07BF and
  // $07D8-$07DF are written by the cartridge and read by nothing.
  state.ring.y.fill(py);                            // $9BA0-$9BA6
  state.ring.x.fill(px);                            // $9BB8-$9BBE
  state.obj.status[0] = 1;                          // $9BC0/$9BC2 STA $0100
  state.ppu.blank = 6;                              // $9BC5/$9BC7 STA $0D
  stopAllSound(state, res);                         // $9BC9 JMP $83AB
}

/**
 * `$9B3E-$9B45` -- `LDX #$5A / LDA #$00 / STA $3D,X / DEX / BPL`, i.e. $3D-$97
 * inclusive, 91 bytes, written out as the fields the port keeps for them.
 *
 * Every address in the range that the port models is here. The ones it does not
 * ($43, $50-$53, $56, $59, $5A, $5E, $70-$97) are RAM the port has no
 * field for; $5E is the only one of them with a name, and it has no reader
 * anywhere in the PRG (two writers, `$99B5` and `$9C0F`, zero readers -- grep).
 */
function clearZeroPage(state) {
  state.cam.sub = 0; state.cam.lo = 0; state.cam.hi = 0;   // $3D $3E $3F
  state.zp.speed = 0;                               // $40
  state.zp.missile = 0;                             // $41
  state.zp.meter = 0;                               // $42  (restored at $9B66)
  state.zp.weapon = 0;                              // $44
  state.zp.options = 0;                             // $45
  state.zp.shield = 0;                              // $46
  state.zp47 = 0;                                   // $47
  state.zp48 = 0;                                   // $48  the HUD rotation
  state.zp49 = 0;                                   // $49
  state.squad.fill(0);                              // $4A/$4B ($0048+$49)
  state.zp4C = 0;                                   // $4C
  // $4D. W38: THE PORT HAD A FIELD FOR THIS AND WAS NOT CLEARING IT, and the
  // docstring above listed it among "RAM the port has no field for" -- which
  // stopped being true in W24, when st9A0E started writing the countdown's
  // high byte. `LDX #$5A / STA $3D,X` covers $3D-$97 and $4D is inside it.
  // Inert on every path measured so far ($9A0E rewrites the pair before $99E9
  // reads it, and the death/continue timers are 8-bit), which is why nothing
  // caught it; transcribed now because this wave routes the ENDING through
  // $9B3E and a stale byte in a wipe is a defect whether or not it is read.
  state.zp4D = 0;                                   // $4D
  state.zp4E = 0;                                   // $4E  (W38, the typewriter)
  state.zp4F = 0;                                   // $4F  (W38, the typewriter)
  state.build.lo = 0;                               // $54
  state.build.hi = 0;                               // $55  (restored at $9B6C)
  state.build.ahead = 0;                            // $57
  state.build.prog = 0;                             // $58
  state.zp5B = 0; state.zp5C = 0;                   // $5B $5C
  state.spawn.z5D = 0;                              // $5D
  state.spawn.z5E = 0;                              // $5E  (re-seeded to $3F below)
  state.zp5F = 0;                                   // $5F  the hatch counter, w22
  state.spawn.z60 = 0; state.spawn.z61 = 0;         // $60 $61
  state.spawn.z64 = 0; state.spawn.z65 = 0;         // $64-$67
  state.spawn.z66 = 0; state.spawn.z67 = 0;
  state.spawn.z69 = 0;                              // $69
  state.spawn.z6A = 0; state.spawn.z6B = 0;         // $6A:$6B the wave cursor
  state.spawn.z6C = 0; state.spawn.z6D = 0;         // $6C-$6F
  state.spawn.z6E = 0; state.spawn.z6F = 0;
  state.spawn.z68 = 0;                             // $68 (the warp-rain counter)
}

/**
 * `$882C` -- the full-screen RLE load, REPRODUCED ONLY AS ITS RAM SIDE EFFECTS.
 *
 *   882C  A2 00     LDX #$00                    (X = 2 is the title screen)
 *   882E  BD 93 88 / 85 9B / BD 94 88 / 85 9C   $9B:$9C = $8893[X] = $8C78
 *   8838  20 33 83  JSR $8333  -> $8336 PPUCTRL = PPUMASK = 0
 *                              -> $83B0 $0D = $10
 *   883B  85 0E / 85 1F / 85 13 / 85 12         $0E = $1F = $13 = $12 = 0
 *   8845  PPUADDR := $2000, then six chunks through $8871's RLE
 *   886E  JMP $81B5  -> $10 = $88, PPUCTRL = $88, then $83B0 again ($0D = $10)
 *
 * THE GAP, NAMED. The 2304 `$2007` writes are NOT ported and the nametable is
 * left exactly as it was. MEASURED (00-recon-flow.md 5): `h_8871 = 6` and
 * `h_888B = 2304` per stage load, all of them RUN bytes and no literals,
 * starting at $2000 -- so it is more than one nametable's worth and what 2304
 * bytes from $2000 means for this cartridge's mirroring is an open question the
 * wave plan excludes on purpose. What covers the hole in practice is $9C24: the
 * intro then streams 84 terrain blocks over the next 21 frames, which is 384 px
 * of terrain in front of a camera sitting at 0, so the visible screen is rebuilt
 * before $0D lets the picture back on. What is NOT covered is anything $8871
 * draws that the streamer does not -- and on a RESPAWN the port keeps the old
 * screen's tiles outside that band.
 *
 * $0D is set to $10 twice here and then to 6 by $9BC5 four instructions later,
 * so neither survives; both are written down because the ORDER is the only
 * reason the screen is blank for the whole intro rather than for 16 frames.
 *
 * The frame overrun is here rather than in introReset() because $882C is what
 * costs the time: 2304 PPU writes in one NMI. See state.frameDrops.
 */
function fullScreenLoad(state) {
  state.ppu.blank = 0x10;                           // $8838 -> $8333 -> $83B0
  state.vram.cursor = 0;                            // $883B STA $0E
  state.zp1F = 0;                                   // $883F STA $1F
  state.ppu.scrollY = 0;                            // $8841 STA $13
  state.ppu.scrollX = 0;                            // $8843 STA $12
  // $8849-$886B: PPUADDR = $2000 and six JSR $8871 chunks. NOT PORTED.
  state.ppu.ctrl = 0x88;                            // $886E -> $81B5 $10 = $88
  state.ppu.blank = 0x10;                           // $81BC -> $83B0
  // The cartridge's own work overran this frame's vblank on every measured run:
  // one dropped NMI, at game frame 283 on a boot and 614 on a respawn, and none
  // anywhere else in either run.
  state.frameDrops = 1;
}

/**
 * `$9BED` -- intro state 1, which is a one-instruction prologue in front of
 * `sub_9BF0`. `$96E6` (the next-stage arm) calls $9BF0 directly, which is why
 * the ROM has two labels and this has one function with a note.
 *
 *   9BED  20 AB 83  JSR $83AB          stop all four channels ($FC)
 *   9BF0  A9 10 / 20 E8 85  JSR $85E8  packet $10, WITH the mode-byte prologue
 *   9BF5  A5 19 / 18 / 69 08           A := $19 + 8
 *   9BFA  20 F3 85  JSR $85F3          <- $85F3, NOT $85E8: no mode byte, this
 *                                         one CONTINUES packet $10's open run
 *   9BFD  A9 07 / 20 E8 85             packet 7
 *   9C02  A9 05 / 20 E8 85             packet 5   (the $FD arm: two packets)
 *   9C07  E6 1B                        INC $1B
 *   9C09  A9 00 / 85 57                $57 = 0     <- FALL-THROUGH, see below
 *   9C0D  A9 3F / 85 5E                $5E = #$3F
 *   9C11  60
 *
 * MEASURED at the $80B5 sample of the frame this runs: $0E = 49 on the boot
 * (f284) and on the respawn (f615) -- 48 packet bytes plus $8641's terminator.
 *
 * THE FALL-THROUGH AT $9C07 IS REAL, and this file used to stop at INC $1B.
 * tests/flow-unwitnessed.test.js dumped the 36 bytes from $9BED off the
 * cartridge to prove it: the RTS is at $9C11, not $9C08. It was INERT while the
 * port could only reach the intro from a cold state ($9B3E's wipe zeroes $57 one
 * frame earlier and intro states 1-3 never call $9D8E), and wave 5 is exactly
 * when it stops being inert -- `$97EB JSR $9C09` inside the respawn and
 * `$980B JMP $9C09` on the game-over arm both enter sub_9C09 on their own, and
 * on those paths this store is the only thing that clears $57.
 */
export function introPackets(state, res) {
  const packets = res.hudPackets;
  stopAllSound(state, res);                         // $9BED JSR $83AB
  sub9BF0(state, res);                              // $9BF0 (falls through into $9C09)
}

/**
 * `$9BF0` -- the stage-HUD packet body, shared by intro state 1 (`$9BED ->
 * $9BF0`) and the next-stage arm `$96CF` (`$96E6 JSR $9BF0`, WITHOUT `$9BED`'s
 * stop-sound prologue). Emits packet $10, the stage-name continuation ($19+8),
 * packets 7 and 5; `INC $1B`; then the `$9C09` fall-through that re-seeds the
 * despawn cursor (`clearAhead`). The `INC $1B` is overwritten by `$96CF`'s
 * later `$9C3C` (`$1B := $80`); it is executed anyway because it is the ROM's
 * own straight-line path and the intermediate value is a compared field for the
 * one frame it lives.
 */
export function sub9BF0(state, res) {
  const packets = res.hudPackets;
  cannedPacket(state, packets, 0x10);               // $9BF0/$9BF2
  copyPacket(state, packets, u8(state.zp19 + 8));   // $9BF5-$9BFA
  cannedPacket(state, packets, 0x07);               // $9BFD/$9BFF
  cannedPacket(state, packets, 0x05);               // $9C02/$9C04
  state.substate = u8(state.substate + 1);          // $9C07 INC $1B
  clearAhead(state);                                // falls through into $9C09
}

/**
 * `$9C09` -- `LDA #$00 / STA $57 / LDA #$3F / STA $5E / RTS`.
 *
 * A real subroutine with three entries: the fall-through above, `$97EB JSR
 * $9C09` inside `$979D` (the respawn) and `$980B JMP $9C09` on the demo's
 * game-over arm.
 *
 * `$5E` IS NOT MODELLED AND THAT IS NOT AN OVERSIGHT: `LDA #$3F` is an
 * IMMEDIATE, not `LDA $3F`, and the PRG contains TWO writers of $5E ($99B5 and
 * $9C0F) and ZERO readers. There is nothing for the port to keep it for.
 */
export function clearAhead(state) {
  state.build.ahead = 0;                            // $9C09/$9C0B STA $57
  // $9C0D LDA #$3F / $9C0F STA $5E -- the immediate #$3F, NOT the register $3F.
  // $5E is the despawn sweep cursor (wave 24, sub_$994A); re-seeded here on every
  // intro so the $84 crawl starts the sweep at the right column.
  state.spawn.z5E = 0x3F;                           // $9C0F STA $5E
}

/**
 * `$9C12` -- intro state 2: three of the four HUD producers, called DIRECTLY.
 *
 *   9C12  20 B6 88  JSR $88B6   lives
 *   9C15  20 F6 88  JSR $88F6   top score
 *   9C18  20 2C 89  JSR $892C   score
 *   9C1B  E6 1B / 60
 *
 * No $0E gate, no $02 parity, no $48 rotation -- $8898's three gates are all in
 * $8898, and this is not $8898. MEASURED $0E = 37 at f285/f616: 8 + 14 + 14 + 1.
 */
export function introHud(state, res) {
  stLives(state, res.hudPackets);                   // $9C12
  stTopScore(state, res.hudPackets);                // $9C15
  stScore(state, res.hudPackets);                   // $9C18
  state.substate = u8(state.substate + 1);          // $9C1B INC $1B
}

/**
 * `$9C1E` -- intro state 3: the power-up meter, which falls through into
 * $8A30's cursor patch inside src/hud.js. MEASURED $0E = 40 at f286/f617.
 */
export function introMeter(state, res) {
  stPowerBar(state, res.hudPackets);                // $9C1E JSR $89E3
  state.substate = u8(state.substate + 1);          // $9C21 INC $1B
}

/**
 * `$9C24` -- intro state 4, and the only one that loops.
 *
 *   9C24  A9 05 / 85 0D       $0D = 5   (re-armed every frame, over $96C0's 3)
 *   9C28  A5 57 / D0 0C       $57 != 0 -> $9C38
 *   9C2C  20 8E 9D  JSR $9D8E
 *   9C2F  20 8E 9D  JSR $9D8E
 *   9C32  20 8E 9D  JSR $9D8E
 *   9C35  4C 8E 9D  JMP $9D8E     <- a JMP: the fourth call is a tail call and
 *                                    $1B is NOT advanced on this path
 *   9C38  A9 01 / 85 1F        $1F = 1, the sprite-0 handover
 *   9C3C  A9 01 / 85 60        $60 = 1, the spawn engine may load its chunk
 *   9C40  A9 80 / 85 1B        $1B = $80: PLAY
 *
 * $9D8E, not $9D83: the four calls skip the $3A and `$0E < 4` gates entirely,
 * which is how the queue reaches 149 bytes (4 x 37 + $8641's one) on a frame
 * whose gate would have refused after the first. MEASURED $0E = 149 on frames
 * 287-308 and 618-639, and $57 0 -> 1 on 308 and 639.
 *
 * Every one of the four calls runs even after the throttle: $9D90 rewrites $57
 * to 0 at the top of each, so it is the LAST call of the frame that decides
 * what $9C28 reads next frame.
 */
export function introTerrain(state, res) {
  state.ppu.blank = 5;                              // $9C24/$9C26
  if (state.build.ahead === 0) {                    // $9C28 LDA $57 / BNE $9C38
    // W38: `res.stages[$19]`, NOT `res.stage`. These four were the ONE reader
    // of `res.stage` left in the runtime, and src/assets.js said in so many
    // words that there were none ("nothing in the runtime reads res.stage
    // after boot"). `res.stage` is the stage the LAUNCHER selected and it never
    // moves; `$9D8E` is the same routine `$9ACE` reaches through streamBlock(),
    // which has read `res.stages[state.zp19]` since W27's seamless transition.
    // So an intro on any stage but the first streamed STAGE 1's blocks --
    // reachable on every stage-2+ RESPAWN, which is a shipped path, and now
    // reachable a second way because the ending replays the intro. On stage 1
    // the two expressions are the same object, which is why nothing caught it.
    const stage = res.stages[state.zp19];
    buildBlock(state, stage);                       // $9C2C
    buildBlock(state, stage);                       // $9C2F
    buildBlock(state, stage);                       // $9C32
    buildBlock(state, stage);                       // $9C35 JMP $9D8E
    return;
  }
  state.zp1F = 1;                                   // $9C38/$9C3A
  startPlay(state);                                 // FALL-THROUGH into $9C3C
}

/**
 * `$9C3C` -- `$60 = 1 / $1B = $80`. A real subroutine ($96E9 calls it) and also
 * $9C24's fall-through target, which is why it is separate here too.
 */
export function startPlay(state) {
  state.spawn.z60 = 1;                              // $9C3C/$9C3E
  state.substate = 0x80;                            // $9C40/$9C42
}

/**
 * `$9AD1`-`$9B3D` -- PAUSE. Runs at the very END of the mode-5 tail, AFTER the
 * streamer, on played frames and on paused ones alike.
 *
 *   9AD1  A5 1B / 10 04     bit 7 clear -> RTS   (no pausing during the intro)
 *   9AD5  29 70 / F0 01     any of bits 4-6 -> RTS (not while dying/game over)
 *   9ADA  A5 09 / 05 16 / 05 0D / D0 5B     demo, $16 or blanking -> RTS
 *   9AE2  A5 05 / A4 15 / D0 17   A = the PRESSED byte, Y = $15; the BNE tests
 *                                 $15, so an already-paused frame goes to $9AFF
 *                                 with A still holding $05
 *   9AE8  29 10 / F0 51     START not pressed -> RTS
 *   9AEC  A9 01 / 85 15     PAUSED
 *   9AF0  A2 10 / B5 B0 / 9D A0 01 / CA / 10 F8   save $B0-$C0 to $01A0-$01B0
 *   9AFA  A9 3B / 4C 1E EC  the pause sound, and the routine ENDS there
 *
 * MEASURED (00-recon-flow.md 8): START at f450 set $15 = 1 and $3E stuck at 68
 * for 50 frames; START at f500 cleared it and the camera resumed.
 *
 * The 17-byte struct save and the `$3B` request at $9AFA ARE reproduced as of
 * wave 8 (src/sound.js). $B0-$C0 is pulse 1's channel struct, and $3B's record
 * targets pulse 1 -- so the save is what lets the music resume on exactly the
 * tick it stopped on. MEASURED from the other side: the driver-cycle sequence
 * for frames 491-499 and 562-570 of a pause run is byte-identical.
 */
export function pauseCheck(state, res) {
  if (!(state.substate & 0x80)) return;             // $9AD1 LDA $1B / BPL $9AD9
  if (state.substate & 0x70) return;                // $9AD5 AND #$70 / BNE
  // $9ADA-$9AE0. $0D is the reason a paused frame cannot be entered during the
  // intro even though $9AD1 is unreachable from there anyway.
  if (state.zp09 !== 0 || state.zp16 !== 0 || state.ppu.blank !== 0) return;
  if (state.zp15 !== 0) { resumeCheck(state, res); return; }  // $9AE4/$9AE6
  if (!(state.input.pressed & BTN.START)) return;   // $9AE8 AND #$10 / BEQ
  state.zp15 = 1;                                   // $9AEC/$9AEE STA $15
  pauseSaveChannel(state, res);                     // $9AF0-$9AFC
}

/**
 * `$9AFF` -- the arm a frame takes when it is ALREADY paused.
 *
 *   9AFF  A6 18 / B5 3B / 30 16      $3B,X negative -> straight to $9B1B
 *   9B05  A2 02 / 20 65 97           run the button-code matcher, code 2
 *   9B0A  A5 33 / C9 0A / D0 0B      $33 == 10 -> the cheat
 *   9B10  20 5E 9C  JSR $9C5E        $46=5 $41=1 $40=1 $45=2
 *   9B13  A6 18 / D6 3B / A9 00 / 85 33
 *   9B1B  A5 05 / 29 10 / F0 1C      START not pressed -> RTS
 *   9B21  A9 00 / 85 15              UNPAUSE
 *   9B25  E6 5B                      INC $5B
 *   9B27  85 B2 / A9 30 / 8D 00 40 / A5 D7 / 8D 08 40   the APU writes
 *   9B33  A2 10 / BD A0 01 / 95 B0 / CA / 10 F8         the struct restore
 *
 * `$9B25 INC $5B` IS INERT AND IS PORTED ANYWAY. $9AD1 is the last thing the
 * mode-5 frame does, and $9658 `STA $5B` is the fourth instruction of the next
 * one, so no reader of $5B ever sees this value -- $9A9C and $9ACA both ran
 * thousands of cycles earlier in this same frame. It is here because leaving
 * out a store on the grounds that nothing reads it is how a port acquires a
 * difference nobody can find later.
 */
function resumeCheck(state, res) {
  const p = playerIndex(state);                     // $9AFF LDX $18
  if (!(state.cheat[p] & 0x80)) {                   // $9B01 LDA $3B,X / BMI
    codeMatch(state, res, 2);                       // $9B05 LDX #$02 / JSR $9765
    if (state.zp33 === 0x0A) {                      // $9B0A/$9B0C CMP #$0A
      // WAVE 12: this said "no measured run has reached it". MEASURED with an
      // exec hook on $9C5E over 27,400 cartridge frames of seven scripts
      // (tools/oracle/throwaudit.py): **4 executions, first at frame 4191** --
      // and NOT from this call site. Both runs that reached it had already hit
      // GAME OVER ($96FB at 3380/3968), so what executed $9C5E is the CONTINUE
      // screen's own code path, which the port does not have either. Nothing
      // measured has reached it from $9B10, i.e. from a live pause. The
      // distinction is written down rather than averaged away, because "4" and
      // "4 from somewhere else" lead to different next steps.
      throw new Error('$9B10 JSR $9C5E: the pause-screen button code was '
                    + 'entered. The cheat it grants ($46=5, $41=1, $40=1, '
                    + '$45=2) is not ported. $9C5E itself IS executed on the '
                    + 'cartridge (4 times in 27400 frames, first at f4191) but '
                    + 'only after GAME OVER, never from this pause path.');
    }
  }
  if (!(state.input.pressed & BTN.START)) return;   // $9B1B/$9B1D/$9B1F
  state.zp15 = 0;                                   // $9B21/$9B23
  state.zp5B = u8(state.zp5B + 1);                  // $9B25 INC $5B -- inert
  pauseRestoreChannel(state);                       // $9B27-$9B3B
}

/**
 * `$9765` -- the shared button-code matcher, one button per frame.
 *
 *   9765  BD 85 97 / 85 98 / BD 86 97 / 85 99   $98:$99 = $9785[X]
 *   976F  A6 18     LDX $18
 *   9771  A4 33     LDY $33
 *   9773  30 0F     BMI $9784      $33 negative -> the code is spent, RTS
 *   9775  B5 05     LDA $05,X      the PRESSED byte for THIS player
 *   9777  F0 0B     BEQ $9784      nothing pressed this frame -> no reset
 *   9779  D1 98     CMP ($98),Y
 *   977B  F0 04     BEQ $9781      match -> INY
 *   977D  A0 00     LDY #$00       mismatch -> back to the start
 *   9782  84 33     STY $33
 *
 * Two things a re-implementation gets wrong by default and this does not: a
 * frame with NO button pressed does not reset the match (`$9777 BEQ`), and the
 * comparison is against the whole pressed byte, so pressing two buttons at once
 * never matches. `$05,X` with X = $18 is $05 for player 1 and $06 for player 2;
 * the port has one controller and throws above for any other $18.
 *
 * Ported because $9AFF runs it on EVERY paused frame, so $33 is live state
 * whenever anything is paused -- not because the cheat is reachable.
 */
export function codeMatch(state, res, which) {
  const ptr = res.flowTables.word(0x9785 + which);  // $9765/$976A
  if (state.zp33 & 0x80) return;                    // $9771/$9773 BMI $9784
  const pressed = state.input.pressed;              // $9775 LDA $05,X ($18 = 0)
  if (pressed === 0) return;                        // $9777 BEQ $9784
  const want = res.flowTables.read(ptr + state.zp33);         // $9779 CMP ($98),Y
  state.zp33 = pressed === want ? u8(state.zp33 + 1) : 0;     // $977B/$977D
}
