// THE $80D4 GAME MODES -- everything the cartridge is when it is not playing.
//
// src/nmi.js owns the frame and src/flow.js owns mode 5's own state machine;
// this file owns the SEVEN-entry table those two hang off. `$00` is the game
// mode and `$80D1 JSR $83E4` dispatches it through the inline word table at
// `$80D4`:
//
//   0  $80E2  BOOT / TITLE SCROLL   two full-screen loads, then $12 $FE -> 0
//   1  $8116  THE TITLE MENU        the cursor ship and a 256-frame countdown
//   2  $8121  THE ATTRACT DEMO      a scripted play session ($9C6D drives $05)
//   3  $8137  START PRESSED         the jingle and 80 frames of blinking
//   4  $8165  $1B := 0              three instructions; hands over to play
//   5  $9650  PLAY                  src/nmi.js stagePlay()
//   6  $816C  two RAM clears, then back to mode 0   -- SEE "MODE 6" BELOW
//
// ========================= FALL-THROUGH NUMBER EIGHTEEN ======================
//
// docs/knowledge/02 trap 1, and it is load-bearing here rather than cosmetic:
//
//   8273  20 A1 82  JSR $82A1
//   8276  20 B6 82  JSR $82B6
//   -- no RTS --
//   8279  A2 00     LDX #$00      <- sub_8279, xref'd from $8220 as a CALL
//   827B  86 4C     STX $4C
//   827D  E8        INX
//   827E  86 4D     STX $4D
//   8280  60        RTS
//
// `$8256` does NOT end at $8276. It falls into `$8279` and seeds `$4C:$4D` with
// `$0100` -- 256 -- and that pair IS the title screen's length: `$8116` calls
// `$819B`, which 16-bit-decrements it through `$840C` once per frame and hands
// the game to the attract demo when it reaches zero. Stop reading at the last
// JSR and the title menu never ends, because the pair is left at whatever the
// previous mode wrote. The rule earned it again: READ PAST THE APPARENT END.
//
// ================================ MODE 6 =====================================
//
// `$816C` is transcribed below and NOTHING IN THE PRG PUTS 6 IN `$00`. That is
// an enumeration, not an impression -- every writer of `$00` in the 32 KB:
//
//   direct       $8059 (:=0, RESET)   $818F (:=0 from $8135/$8131, :=3 from
//                $8234)   $8251 (:=1)   $852E (:=0, the A+B service screen)
//                $9712 (:=4)   $9756 (:=0)
//   INC $00      $8186, and its four callers reach it with $00 = 0, 1, 3 or 4
//                ($810B, $811E, $8162, $8169), so it produces 1, 2, 4 and 5
//   STA $00,X    $830E with X = $12..$EF; $8405/$8411 with X in
//                {$3E,$4C,$54,$6A,$A8,$AA} (all nine call sites read)
//   STA ($98),Y  $831F ($0300-$06FF), $8436 ($0100-$017F and $0020-$0097),
//                $802C (RESET's $0000-$07CF wipe, and it writes 0)
//
// So 6 is produced by nothing. It is ported anyway and it is NOT commented
// "unreachable": three "unreachable" comments in this project have turned out to
// be artefacts of something else being unported, and a seventh table entry that
// throws is worse than a seventh table entry that runs. What can honestly be
// said is the sentence above -- no writer found -- and tests/modes.test.js pins
// the enumeration so a future wave which finds the writer finds this note too.
//
// ============================ WHAT IS *NOT* HERE =============================
//
//   * THE PICTURE. `$882C`/`$8824`'s 2304 `$2007` writes are still the named gap
//     src/flow.js has carried since W4. W39 identified the source data (`$8893`
//     is a two-entry INTERLEAVED word table -> $8C78 playfield and $8C8C
//     title/attract, six RLE chunks each, escape $34, terminator $39), which
//     retires export_assets.py's "its source table has not been identified", but
//     emitting the bytes is a separate wave. Until then the title screen runs
//     with the nametable it inherited.
//   * `$8336`'s DIRECT `$2000`/`$2001` writes. The port's picture comes from the
//     band latches src/nmi.js takes at `$809C`, and those are taken BEFORE the
//     mode dispatch, so a register written at `$8309` lands nowhere. This is the
//     same treatment `fullScreenLoad` has given `$8333` since W4 and it is a
//     deviation of at most one frame: `$83B0` sets `$0D = $10` in the same
//     breath and `$808A` then blanks the next fifteen frames for real.
//   * TWO PLAYERS. `$8232` writes `$03 := $70` when the cursor is on 2 PLAYERS
//     and that is transcribed verbatim, WITHOUT a clamp. The port has one
//     controller and `playerIndex()` in src/flow.js throws on `$18 = 1`, so the
//     two-player route reaches its existing loud throw instead of a plausible
//     wrong game.

import { u8 } from './state.js';
import { cannedPacket } from './hudpackets.js';
import { fullScreenLoad, titleScreenLoad, clearZeroPage } from './flow.js';
import { stopAllSound, soundRequest } from './sound.js';

// ---------------------------------------------------------------------------
//  Shared tails
// ---------------------------------------------------------------------------

/**
 * `$8186` -- `INC $00`, then the `$8188` tail.
 *
 *   8186  E6 00     INC $00
 *   8188  A9 00 / 85 0B / 85 01 / 60
 *
 * Four callers, all of them "this mode is finished": $810B (the title scroll
 * reached $12 = 0), $811E (the menu countdown expired), $8162 (the start jingle
 * is over) and $8169 (mode 4, always).
 */
function advanceMode(state) {
  state.mode = u8(state.mode + 1);                  // $8186 INC $00
  clearModePhase(state);                            // falls into $8188
}

/**
 * `$818F` -- `STA $00 / LDA #$20 / STA $4C / BNE $8188`.
 *
 * Enter with the mode to switch TO. Two callers with two different values:
 * `$8236` arrives with 3 (START on the menu) and `$8135` with 0 (the demo
 * ended). `$4C := $20` seeds mode 3's blink counter for the first and is
 * overwritten by `$8256`'s fall-through for the second.
 */
function setMode(state, mode) {
  state.mode = u8(mode);                            // $818F STA $00
  state.zp4C = 0x20;                                // $8191/$8193 LDA #$20 / STA $4C
  clearModePhase(state);                            // $8195 BNE $8188
}

/** `$8188` -- `$0B := 0 / $01 := 0`. */
function clearModePhase(state) {
  state.zp0B = 0;                                   // $818A STA $0B
  state.zp01 = 0;                                   // $818C STA $01
}

// ---------------------------------------------------------------------------
//  The RAM clears
// ---------------------------------------------------------------------------

/**
 * `$8418` -- clear `$0100-$017F`.
 *
 *   8418  A9 00 / A2 01 / A0 7F / D0 10 -> $8430
 *   8430  85 98 / 86 99 / A9 00
 *   8436  91 98 / 88 / C0 FF / D0 F9 / 60
 *
 * The DEY/`CPY #$FF` shape means Y runs $7F down to $00 inclusive -- 128 bytes,
 * one page half -- so it is the four 32-byte object arrays and nothing else.
 * The dead bytes at `$8420` (`A0 FF / D0 0C`) are a third entry point with
 * `Y = $FF` that nothing references.
 */
function clear0100(state) {
  state.obj.status.fill(0);                         // $0100-$011F
  state.obj.anim.fill(0);                           // $0120-$013F
  state.obj.timer.fill(0);                          // $0140-$015F
  state.obj.animFrame.fill(0);                      // $0160-$017F
  state.ring.cursor = 0;                            // $0160 aliases animFrame[0]
}

/**
 * `$8424` -- clear `$0020-$0097`, 120 bytes.
 *
 *   8424  A9 20 / A0 77 / D0 04 -> $842E
 *   842E  A2 00                 -> $8430 with $98:$99 = $0020
 *
 * `$003D-$0097` is EXACTLY the range `$9B3E` wipes, so the second half of this
 * is src/flow.js's `clearZeroPage()` and is not written twice. What is new is
 * `$0020-$003C`: the lives, the four saved per-player bytes, the extra-life
 * thresholds, the CHR select, the OAM cursors, the demo script's cursor pair and
 * the cheat counters.
 *
 * `$2C`, `$2E`, `$32`, `$34`, `$37` and `$38` are cleared by the cartridge and
 * the port has no field for them. Named here rather than left to be noticed:
 * nothing in src/ reads them, so there is nothing to clear.
 */
function clear0020(state) {
  state.lives.fill(0);                              // $20/$21
  state.save22.fill(0);                             // $22,X
  state.save24.fill(0);                             // $24,X
  state.save26.fill(0);                             // $26,X
  state.save28.fill(0);                             // $28,X
  state.extraLife.fill(0);                          // $2A,X
  state.ppu.chrSel = 0;                             // $2D
  state.oamBase = 0;                                // $2F
  state.zp30 = 0;                                   // $30  the demo script's timer
  state.zp31 = 0;                                   // $31  the demo script's cursor
  state.zp33 = 0;                                   // $33
  state.zp.autofire = 0;                            // $35
  state.oamCursor = 0;                              // $36
  state.zp39 = 0;                                   // $39
  state.build.gate = 0;                             // $3A
  state.cheat.fill(0);                              // $3B,X
  clearZeroPage(state);                             // $003D-$0097, = $9B3E's wipe
}

/**
 * `$8307` -- the NEW-GAME WIPE, the biggest clear in the cartridge.
 *
 *   8307  A2 12     LDX #$12
 *   8309  20 36 83  JSR $8336        PPUCTRL := 0, PPUMASK := 0
 *   830C  A9 00 / 95 00 / E8 / E0 F0 / D0 F9      $0012-$00EF
 *   8315  A2 07 / A0 03 / 84 99 / 85 98 / A0 00
 *   831F  91 98 / C8 / D0 FB / E6 99 / E4 99 / D0 F5   $0300-$06FF
 *   832A  20 B0 83  JSR $83B0        $0D := $10
 *   832D  A5 10 / 8D 00 20           PPUCTRL := $10 (which survived the wipe)
 *
 * THE ZERO-PAGE RANGE STARTS AT $12, NOT AT $00. `$00` (the mode), `$01` (the
 * mode's phase), `$02` (the frame counter), `$03` (the config byte `$8232` has
 * just written), `$05`-`$08` (the pads), `$0B`, `$0E`, `$0F`, `$10` and `$11`
 * all SURVIVE -- which is the only reason `$832D` can restore PPUCTRL from `$10`
 * and the only reason `$82C7` has to save and restore `$0A` by hand around it.
 *
 * `$00B0-$00EF` is inside the range, so this ALSO wipes 64 of the sound driver's
 * 80 bytes ($00B0-$00FF, src/sound.js SND_BASE). $00F0-$00FF survives, and that
 * is the cartridge's own line rather than a convenience: `$8394` uses `$F0` as a
 * once-per-boot latch and it sits deliberately outside the wipe.
 */
function newGameWipe(state) {
  // $8309 JSR $8336 -- PPUCTRL/PPUMASK := 0. See the file header: the port's
  // picture is latched at $809C, before this runs, so there is nothing to store.

  // $830C-$8313: $0012-$00EF.
  state.ppu.scrollX = 0;                            // $12
  state.ppu.scrollY = 0;                            // $13
  // $14 is a real RAM byte with NO READER: `EOR $14 / STA $14` at $81E7/$81E9
  // are the only two instructions in the PRG that name it (full opcode scan).
  // The port has no field for it and there is nothing to clear.
  state.zp15 = 0;                                   // $15
  state.zp16 = 0;                                   // $16
  state.zp17 = 0;                                   // $17
  state.zp.player = 0;                              // $18
  state.zp19 = 0;                                   // $19
  state.zp1A = 0;                                   // $1A
  state.substate = 0;                               // $1B
  state.zp1C = 0;                                   // $1C
  // $1D has no port field.
  state.zp1E = 0;                                   // $1E
  state.zp1F = 0;                                   // $1F
  clear0020(state);                                 // $0020-$0097, as $8424's

  // $0098-$00AF is ROM scratch the port keeps as JS locals -- see the note in
  // src/hudpackets.js on $9A/$9B. $00B0-$00EF is the sound driver's.
  state.snd.fill(0, 0x00, 0xEF - 0xB0 + 1);         // $00B0-$00EF (SND_BASE $B0)

  // $8315-$8328: $0300-$06FF, four pages, through ($98),Y with $99 = 3..6.
  state.obj.type.fill(0);                           // $0300
  state.obj.y.fill(0);                              // $0320
  state.obj.yf.fill(0);                             // $0340
  state.obj.x.fill(0);                              // $0360
  state.obj.xf.fill(0);                             // $0380
  state.obj.carrier.fill(0);                        // $03A0
  state.obj.yvel.fill(0);                           // $03B0
  state.obj.yvelf.fill(0);                          // $03E0
  state.obj.style.fill(0);                          // $0400
  state.obj.xvel.fill(0);                           // $0420
  state.obj.xvelf.fill(0);                          // $0440
  state.obj.s0460.fill(0);                          // $0460
  state.obj.s0480.fill(0);                          // $0480
  state.obj.s04A0.fill(0);                          // $04A0
  state.obj.s04C0.fill(0);                          // $04C0
  state.obj.s04E0.fill(0);                          // $04E0
  state.coll.fill(0);                               // $0500-$06FF

  state.ppu.blank = 0x10;                           // $832A JSR $83B0
  // $832D LDA $10 / STA $2000 -- see $8336 above; $10 itself is untouched.
}

// ---------------------------------------------------------------------------
//  The title-screen furniture
// ---------------------------------------------------------------------------

/**
 * `$82A1` -- draw the MENU CURSOR, which is the Vic Viper itself.
 *
 *   82A1  A9 50 / 8D 60 03          $0360 = $50   the ship's X
 *   82A6  A9 01 / 8D 20 01          $0120 = 1     metasprite 1, the level ship
 *   82AB  A6 0F / BD B4 82 / 8D 20 03   $0320 = $82B4[$0F]
 *   82B4  .byte $86 $96
 *
 * so the cursor is object 0 -- the PLAYER's slot -- parked at X = 80 and moved
 * between Y = 134 (1 PLAYER) and Y = 150 (2 PLAYERS). `$0100` is NOT set, so the
 * ship is drawn by `$8B10`'s display-list walk purely on `$0120` being non-zero.
 */
function drawCursor(state, res) {
  state.obj.x[0] = 0x50;                            // $82A1/$82A3
  state.obj.anim[0] = 0x01;                         // $82A6/$82A8
  const cur = state.zp0F;                           // $82AB LDX $0F
  if (cur !== 0 && cur !== 1) {
    // $82AD indexes a TWO-byte table. $8239's `2 - $0F` reset is what keeps $0F
    // in {0,1}; anything else would read $82B6's opcodes as a Y coordinate.
    throw new Error(`$82AD LDA $82B4,X: menu cursor $0F = ${cur} is past the `
                  + `two-entry table at $82B4 ($86 $96)`);
  }
  state.obj.y[0] = res.flowTables.read(0x82B4 + cur);  // $82AD/$82B0
}

/**
 * `$82B6` -- the four title-screen text packets, queued HIGH index first.
 *
 *   82B6  A9 03 / 85 A0
 *   82BA  A5 A0 / 18 / 69 01 / 20 E8 85 / C6 A0 / 10 F4 / 60
 *
 * `$A0` counts 3,2,1,0 and the packet index is `$A0 + 1`, so the order on the
 * wire is 4, 3, 2, 1 -- and the order is the whole point, because they are four
 * separate nametable writes that the drainer replays in queue order next frame.
 */
function titlePackets(state, res) {
  for (let a0 = 3; a0 >= 0; a0--) {                 // $82B8 / $82C2 DEC / $82C4 BPL
    cannedPacket(state, res.hudPackets, u8(a0 + 1));// $82BA-$82BF
  }
}

/**
 * `$8256` -- BUILD THE TITLE SCREEN. Called from `$80E9` (the boot) and from
 * `$824C` (START or SELECT pressed during the attract demo).
 *
 *   8256  20 AB 83  JSR $83AB        sound $FC: stop all four channels
 *   8259  A9 03 / 85 2D              CHR bank 3
 *   825D  20 24 88  JSR $8824        the TITLE nametable ($8C8C)
 *   8260  20 18 84  JSR $8418        clear $0100-$017F
 *   8263  20 24 84  JSR $8424        clear $0020-$0097
 *   8266  A9 06 / 20 E8 85           packet 6 -- the title PALETTE ($3F00)
 *   826B  A9 1E / 85 11              $11 = $1E
 *   826F  A9 A8 / 85 10              $10 = $A8   (over $81B5's $88)
 *   8273  20 A1 82  JSR $82A1
 *   8276  20 B6 82  JSR $82B6
 *   8279  ...                        <- THE FALL-THROUGH, see the file header
 *
 * `$8263`'s clear wipes `$2D` again four instructions after `$8259` set it,
 * which is why every mode-0 and mode-1 frame re-writes `$2D = 3` at `$8111`.
 */
function buildTitleScreen(state, res) {
  stopAllSound(state, res);                         // $8256 JSR $83AB
  state.ppu.chrSel = 3;                             // $8259/$825B
  titleScreenLoad(state);                           // $825D JSR $8824
  clear0100(state);                                 // $8260 JSR $8418
  clear0020(state);                                 // $8263 JSR $8424
  cannedPacket(state, res.hudPackets, 0x06);        // $8266/$8268
  state.ppu.mask = 0x1E;                            // $826B/$826D
  state.ppu.ctrl = 0xA8;                            // $826F/$8271
  drawCursor(state, res);                           // $8273 JSR $82A1
  titlePackets(state, res);                         // $8276 JSR $82B6
  seedMenuTimer(state);                             // FALL-THROUGH into $8279
}

/**
 * `$8279` -- `$4C := 0 / $4D := 1`, i.e. the 16-bit pair `$0100` = 256.
 *
 * A real subroutine ($8220 calls it) AND `$8256`'s fall-through target, which is
 * why it is separate here too -- exactly the shape src/flow.js uses for `$9C09`.
 */
function seedMenuTimer(state) {
  state.zp4C = 0x00;                                // $827B STX $4C
  state.zp4D = 0x01;                                // $827E STX $4D
}

/**
 * `$819B` -- tick the menu countdown. Returns TRUE while it is still running.
 *
 *   819B  A2 4C     LDX #$4C
 *   819D  B5 00 / 15 01 / F0 07      $4C | $4D == 0 -> RTS with A = 0
 *   81A3  A9 01 / 20 0C 84           16-bit subtract 1 through $840C
 *   81A8  A9 01                      ...and return non-zero
 *
 * The dead bytes at `$8197` (`A2 4E / D0 02`) are a second entry that would run
 * the same code on the `$4E:$4F` pair. Nothing references it, and W38 gave
 * `$4E`/`$4F` to the ending's typewriter instead.
 */
function tickMenuTimer(state) {
  if ((state.zp4C | state.zp4D) === 0) return false;   // $819D-$81A1
  // $840C with X = $4C: `EOR #$FF / SEC / ADC $4C / STA $4C / BCS / DEC $4D`.
  const lo = state.zp4C - 1;
  state.zp4C = u8(lo);                                 // $840F/$8411
  if (lo < 0) state.zp4D = u8(state.zp4D - 1);         // $8413/$8415
  return true;                                         // $81A8 LDA #$01
}

// ---------------------------------------------------------------------------
//  $821A -- START and SELECT, before the dispatch
// ---------------------------------------------------------------------------

/**
 * `$821A` -- the menu's input handler, called from `$80CC` on modes 0, 1 and 2
 * only, and only while `$03` bit 6 is clear.
 *
 *   821A  A5 05 / 29 30 / F0 27      neither START nor SELECT -> RTS
 *   8220  20 79 82  JSR $8279        re-seed the 256-frame countdown
 *   8223  A6 00 / E0 01 / D0 1F      not mode 1 -> $8248
 *   8229  29 20 / D0 0C              SELECT -> $8239
 *   822D  A6 0F / BD 54 82 / 85 03   $03 := $8254[$0F]  = $40 (1P) or $70 (2P)
 *   8234  A9 03 / 4C 8F 81           mode := 3
 *   8239  E6 0F / A9 02 / 38 / E5 0F / D0 02 / 85 0F    toggle $0F 0<->1
 *   8244  20 A1 82  JSR $82A1        move the cursor ship
 *   8248  A9 00 / 85 0E              THROW AWAY whatever is in the queue
 *   824C  20 56 82  JSR $8256        rebuild the title screen
 *   824F  A2 01 / 86 00              mode := 1
 *
 * `$8232` IS WHERE `$03` COMES FROM, and `$03` is the game's configuration byte
 * for the rest of the session: bit 6 makes `$80C8` stop calling this routine
 * (so START means PAUSE once play begins), bit 5 makes `$81EB` read the two pads
 * separately instead of merging them, and `$8172` masks the byte back down to
 * its low nibble on the way out through mode 6.
 *
 * `$824A`'s `$0E := 0` is a real discard: on the frame the demo is interrupted,
 * everything the demo queued this frame is dropped and `$8256`'s packets start
 * from index 0. Ported as a store rather than as "clear the queue" because the
 * page keeps its bytes -- see src/vram.js on why $0700 is a byte image.
 */
export function sub821A(state, res) {
  const a = state.input.pressed & 0x30;             // $821A/$821C AND #$30
  if (a === 0) return;                              // $821E BEQ $8247
  seedMenuTimer(state);                             // $8220 JSR $8279
  if (state.mode !== 1) {                           // $8223/$8225/$8227 BNE $8248
    state.vram.cursor = 0;                          // $8248/$824A STA $0E
    buildTitleScreen(state, res);                   // $824C JSR $8256
    state.mode = 1;                                 // $824F/$8251 STX $00
    return;
  }
  if (a & 0x20) {                                   // $8229/$822B BNE $8239
    // SELECT: 0 -> 1 -> 0. `LDA #$02 / SEC / SBC $0F` is 2 - $0F, and the store
    // only happens when that is ZERO -- i.e. when the INC has just produced 2.
    state.zp0F = u8(state.zp0F + 1);                // $8239 INC $0F
    if (u8(2 - state.zp0F) === 0) state.zp0F = 0;   // $823B-$8242
    drawCursor(state, res);                         // $8244 JSR $82A1
    return;                                         // $8247 RTS
  }
  // START on the menu. $8254 is a TWO-byte table and $0F is 0 or 1.
  const cur = state.zp0F;                           // $822D LDX $0F
  if (cur !== 0 && cur !== 1) {
    throw new Error(`$822F LDA $8254,X: menu cursor $0F = ${cur} is past the `
                  + `two-entry config table at $8254 ($40 $70)`);
  }
  state.zp03 = res.flowTables.read(0x8254 + cur);   // $822F/$8232 STA $03
  setMode(state, 3);                                // $8234/$8236 JMP $818F
}

// ---------------------------------------------------------------------------
//  The attract demo
// ---------------------------------------------------------------------------

/**
 * `$9C5E` -- the power-up grant: shield 5, missile, speed 1, two Options.
 *
 *   9C5E  A9 05 / 85 46 / A9 01 / 85 41 / 85 40 / A9 02 / 85 45 / 60
 *
 * TWO callers and they are not the same question. `$9C76` runs it once at the
 * top of the attract demo, which is why the demo ship has Options and a shield
 * it never collected; `$9B10` runs it when the PAUSE-screen button code is
 * entered, and that caller is still a loud throw in src/flow.js because its
 * surrounding path (`DEC $3B,X`, `$33 := 0`, and what a live cheat does to a
 * compared run) is a separate question from this wave's.
 */
function grantPowerUps(state) {
  state.zp.shield = 5;                              // $9C5E/$9C60
  state.zp.missile = 1;                             // $9C62/$9C64
  state.zp.speed = 1;                               // $9C66
  state.zp.options = 2;                             // $9C68/$9C6A
}

/**
 * `$9C6D` -- THE DEMO'S JOYSTICK. Overwrites `$05`-`$08` from a script.
 *
 *   9C6D  A5 1B / 30 01 / 60         $1B bit 7 clear (the stage intro) -> RTS
 *   9C72  A4 31 / D0 03 / 20 5E 9C   first frame -> grant the power-ups
 *   9C79  A5 05 / 29 30 / D0 32      REAL START or SELECT -> $9CB1, demo over
 *   9C7F  A5 02 / 4A / B0 12         ODD frame -> $9C96
 *   9C84  A4 31 / F0 28              even, and nothing loaded yet -> RTS
 *         ...falls into $9C88, the applier
 *   9C88  B9 B5 9C / 85 05 / 85 07 / A9 00 / 85 08 / 85 06 / 60
 *   9C96  A4 31 / F0 04              nothing loaded yet -> load the first record
 *   9C9A  A5 30 / D0 0D              the current record still has time -> apply
 *   9C9E  B9 B8 9C / 85 30           $30 := the duration byte
 *   9CA3  C9 FF / F0 0A              $FF -> $9CB1, the script is over
 *   9CA7  C8 / C8 / 84 31            $31 += 2
 *   9CAB  20 88 9C  JSR $9C88 / C6 30  DEC $30
 *   9CB1  E6 0B / 20 AB 83 / 60      INC $0B and stop the music
 *
 * THE TWO TABLE ADDRESSES OVERLAP BY THREE BYTES AND THAT IS NOT A TYPO.
 * `$9C88` reads `$9CB5,Y` and `$9C9E` reads `$9CB8,Y`, but they are reached with
 * DIFFERENT values of Y: `$9C9E` runs with Y = `$31` and then does `INY / INY`
 * before falling into `$9C88`, so both end up naming the SAME record. Writing it
 * as one table based at `$9CB7` with a (button, duration) pair per record is the
 * only way to say that once:
 *
 *     record n  ->  button   = $9CB7 + 2n      (also $9CB5 + ($31 = 2n+2))
 *                   duration = $9CB8 + 2n
 *
 * 75 records, `$9CB7`-`$9D4C`, then `FF FF` at `$9D4D`. The FIRST is `$80 $90`:
 * hold A for 144 ticks.
 *
 * `$9C7D` LOOKS LIKE "the player interrupts the demo" AND CANNOT BE REACHED
 * THAT WAY. `$80C0` runs `$821A` on every mode-2 frame -- `$00 < 3`, and `$03`
 * is 0 for the whole attract loop because `$80F4` clears it -- so a START or
 * SELECT edge is consumed at `$8248`, which sets `$00 := 1`, and `$80CF`'s
 * re-read means `$8121` never runs on that frame at all. The only frame in the
 * game where `$03` still holds `$40` with `$00 < 3` is the one right after
 * `$9751`, and that frame is mode 0. Transcribed, and unreachable through
 * `nmi()` by the same argument as `$824A`'s `$0E := 0`.
 *
 * ONLY THE ODD FRAMES SPEND TIME. `$9C7F LDA $02 / LSR A` sends odd frames to
 * the loader/decrementer and even frames straight to the applier, so a duration
 * of N lasts 2N frames. The third record's duration is `$00`, and the ROM stores
 * it BEFORE it compares, so `$9CAE DEC $30` takes it to `$FF` -- 255 more
 * decrements, i.e. 512 frames on one button. Transcribed, not "fixed".
 */
export function demoInput(state, res) {
  if (!(state.substate & 0x80)) return;             // $9C6D/$9C6F BMI $9C72
  if (state.zp31 === 0) grantPowerUps(state);       // $9C72/$9C74/$9C76
  if (state.input.pressed & 0x30) {                 // $9C79/$9C7B AND #$30
    endDemo(state, res);                            // $9C7D BNE $9CB1
    return;
  }
  if ((state.frame & 0x01) === 0) {                 // $9C7F LDA $02 / $9C81 LSR A
    // EVEN frame: apply only. $9C84 `LDY $31 / BEQ $9CB0` -- nothing loaded yet
    // means the demo has not started and there is no button to apply.
    if (state.zp31 === 0) return;                   // $9C84/$9C86 BEQ $9CB0
    applyDemoButton(state, res, state.zp31);        // falls into $9C88
    return;
  }
  // ODD frame: $9C96.
  if (state.zp31 !== 0 && state.zp30 !== 0) {       // $9C96/$9C98 and $9C9A/$9C9C
    applyDemoButton(state, res, state.zp31);        // $9CAB JSR $9C88
    state.zp30 = u8(state.zp30 - 1);                // $9CAE DEC $30
    return;
  }
  // $9C9E: load the next record. Y is $31 here, so the duration is $9CB8 + $31
  // and the record's own base is $9CB7 + $31.
  const dur = res.flowTables.read(0x9CB8 + state.zp31);  // $9C9E LDA $9CB8,Y
  state.zp30 = dur;                                 // $9CA1 STA $30 -- BEFORE the CMP
  if (dur === 0xFF) {                               // $9CA3/$9CA5 BEQ $9CB1
    endDemo(state, res);
    return;
  }
  state.zp31 = u8(state.zp31 + 2);                  // $9CA7/$9CA8/$9CA9 INY INY STY $31
  applyDemoButton(state, res, state.zp31);          // $9CAB JSR $9C88
  state.zp30 = u8(state.zp30 - 1);                  // $9CAE DEC $30
}

/**
 * `$9C88` -- put one scripted button word into `$05`/`$07` and zero `$06`/`$08`.
 *
 * `y` is `$31`, which is 2n+2 for record n, so the byte is `$9CB5 + y`. Player
 * 2's pair is cleared every tick: the demo is always player 1.
 */
function applyDemoButton(state, res, y) {
  const b = res.flowTables.read(0x9CB5 + y);        // $9C88 LDA $9CB5,Y
  state.input.pressed = b;                          // $9C8B STA $05
  state.input.held = b;                             // $9C8D STA $07
  // $9C8F/$9C91/$9C93: $08 := $06 := 0. The port models one controller and has
  // no field for player 2's pair (src/input.js), so there is nothing to store.
  //
  // $05 AND $07 GET THE SAME BYTE, which means the demo produces a fresh EDGE on
  // every tick a button is held -- `$05` is normally `now & ~prev`. That is the
  // cartridge's, and it is why the demo ship fires continuously without the
  // autofire reload ever mattering.
  //
  // `state.input.prev` is the port's model of the byte `$8208 STY $07,X` leaves
  // for the next frame's `$8202 EOR $07,X`, and on the cartridge that byte IS
  // `$07` -- so overwriting `$07` here overwrites what the next frame subtracts.
  // Keeping `prev` in step is transcription, not a convenience.
  state.input.prev = b;
}

/** `$9CB1` -- `INC $0B / JSR $83AB`, the demo's only exit. */
function endDemo(state, res) {
  state.zp0B = u8(state.zp0B + 1);                  // $9CB1 INC $0B
  stopAllSound(state, res);                         // $9CB3 JSR $83AB
}

/**
 * `$82C7` -- set up the DEMO's game, around the wipe.
 *
 *   82C7  A5 0A / 48                 save $0A across the wipe
 *   82CA  20 07 83  JSR $8307
 *   82CD  68 / 85 0A                 ...and put it back
 *   82D0  E6 20     INC $20          ONE life
 *   82D2  E6 09     INC $09          THE DEMO FLAG
 *
 * `$09` is what makes the demo different from a game: `$835E` skips the BGM
 * change, `$846F` skips the score adder and `$9ADA` refuses to pause. `$20` is
 * INCremented from the zero the wipe just wrote, so the demo has exactly one
 * life and `$979D`'s `DEC $20,X` ends it on the first death.
 */
function startDemo(state) {
  const a = state.zp0A;                             // $82C7/$82C9 LDA $0A / PHA
  newGameWipe(state);                               // $82CA JSR $8307
  state.zp0A = a;                                   // $82CD/$82CE PLA / STA $0A
  state.lives[0] = u8(state.lives[0] + 1);          // $82D0 INC $20
  state.zp09 = u8(state.zp09 + 1);                  // $82D2 INC $09
}

/**
 * `$82D5` -- set up a REAL game. Called from `$815F` (mode 3's tail) and from
 * `$970D` (CONTINUE on the game-over screen).
 *
 *   82D5  20 07 83  JSR $8307
 *   82D8  A2 0B / A9 00 / 9D E4 07 / CA / 10 F8    $07E4-$07EF := 0
 *   82E2  85 09                                    $09 := 0, not a demo
 *   82E4  A5 03 / 29 02 / F0 04 / A9 00 / 85 1A    $03 bit 1 -> $1A := 0
 *   82EE  A0 07 / A5 03 / 29 20 / D0 02 / A0 01
 *   82F8  84 0A                                    $0A := 7 (2P) or 1 (1P)
 *   82FA  A9 03 / 85 20 / 85 21                    three lives each
 *   8300  A9 01 / 85 2A / 85 2B                    extra life at the first $01xxxx
 *
 * `$03` bit 1 is never set by `$8232` (which writes $40 or $70), so the `$1A`
 * clear at `$82EA` is dead on every route this port can reach -- and the wipe
 * two instructions earlier cleared `$1A` anyway. Transcribed because "the bit is
 * never set" is a statement about the routes enumerated so far, not about the
 * byte.
 *
 * `$0A := 7` for two players is the cartridge's own value and it is THREE bits,
 * not two; only bits 0 and 1 have readers ($9703, $974D, $97C7, $97F9).
 */
export function newGame(state) {
  newGameWipe(state);                               // $82D5 JSR $8307
  // $82D8-$82E0: twelve bytes from $07E4. The port's score array is $07E0-$07EB,
  // so $07EC-$07EF have no field -- and no reader anywhere in the PRG either
  // (a full scan finds this store and nothing else naming them).
  state.score.fill(0, 4, 12);                       // $07E4-$07EB
  state.zp09 = 0;                                   // $82E2 STA $09
  if (state.zp03 & 0x02) state.zp1A = 0;            // $82E4-$82EC
  state.zp0A = (state.zp03 & 0x20) ? 0x07 : 0x01;   // $82EE-$82F8
  state.lives[0] = state.lives[1] = 3;              // $82FA-$82FE
  state.extraLife[0] = state.extraLife[1] = 1;      // $8300-$8304
}

// ---------------------------------------------------------------------------
//  The seven modes
// ---------------------------------------------------------------------------

/**
 * MODE 0 -- `$80E2`. BOOT, then the title screen SCROLLING IN.
 *
 *   80E2  A6 01 / D0 19             phase != 0 -> $80FF
 *   80E6  20 2C 88  JSR $882C       the PLAYFIELD nametable ($8C78)
 *   80E9  20 56 82  JSR $8256       ...and the TITLE one over it, plus the rest
 *   80EC  A9 03 / 85 2D             CHR bank 3 again ($8424 wiped it)
 *   80F0  A9 00 / 85 13 / 85 03     scroll Y = 0, and $03 back to a clean 0
 *   80F6  E6 1F                     $1F := 1 ($882C had just zeroed it)
 *   80F8  A9 FE / 85 12             scroll X := 254
 *   80FC  E6 01                     phase := 1
 *
 *   80FF  A9 06 / 20 E8 85          packet 6 -- the palette, EVERY frame
 *   8104  A9 00 / 8D 20 01          $0120 := 0: no cursor ship while it scrolls
 *   8109  A5 12 / F0 79             scroll X reached 0 -> $8186, mode 1
 *   810D  C6 12 / C6 12             ...otherwise TWO pixels per frame
 *   8111  A9 03 / 85 2D / 60
 *
 * TWO FULL-SCREEN LOADS IN ONE FRAME, which is 4608 `$2007` writes and is the
 * reason `$8845`'s PPUADDR is `$2000` in both: `$8C78` lays down the playfield
 * image and `$8C8C` overwrites the part of it the title needs. The port does
 * neither (see the file header) but runs both sets of RAM side effects in the
 * ROM's order, because the second one's `$1F := 0` and `$12 := 0` are exactly
 * what `$80F6` and `$80F8` are correcting.
 *
 * 127 FRAMES, exactly: 254 down to 0 by twos, and the `BEQ` is tested BEFORE the
 * decrements, so the frame that reads 0 is the frame that leaves.
 */
export function st80E2(state, res) {
  if (state.zp01 === 0) {                           // $80E2/$80E4 BNE $80FF
    // NO DROPPED NMI ON THIS FRAME, and it is measured rather than assumed.
    // This frame does 4608 `$2007` writes -- TWICE what `$9B78`'s single load
    // does -- and `gameover`'s cartridge rows read `lagged` 0 at f4365 while
    // reading 1 at f4364, the `$9751` frame that ran one load. See the note at
    // the `$9B78` call site in src/flow.js: the drop belongs to the call site.
    fullScreenLoad(state, 0);                       // $80E6 JSR $882C
    buildTitleScreen(state, res);                   // $80E9 JSR $8256
    state.ppu.chrSel = 3;                           // $80EC/$80EE
    state.ppu.scrollY = 0;                          // $80F0/$80F2
    state.zp03 = 0;                                 // $80F4 STA $03
    state.zp1F = u8(state.zp1F + 1);                // $80F6 INC $1F
    state.ppu.scrollX = 0xFE;                       // $80F8/$80FA
    state.zp01 = u8(state.zp01 + 1);                // $80FC INC $01
    return;                                         // $80FE RTS
  }
  cannedPacket(state, res.hudPackets, 0x06);        // $80FF/$8101
  state.obj.anim[0] = 0;                            // $8104/$8106 STA $0120
  if (state.ppu.scrollX === 0) {                    // $8109/$810B BEQ $8186
    advanceMode(state);                             // $8186 -> mode 1
    return;
  }
  state.ppu.scrollX = u8(state.ppu.scrollX - 1);    // $810D DEC $12
  state.ppu.scrollX = u8(state.ppu.scrollX - 1);    // $810F DEC $12
  state.ppu.chrSel = 3;                             // $8111/$8113
}

/**
 * MODE 1 -- `$8116`. THE TITLE MENU: draw the cursor, count 256 frames down.
 *
 *   8116  20 A1 82  JSR $82A1
 *   8119  20 9B 81  JSR $819B
 *   811C  D0 F3     BNE $8111        still counting -> $2D := 3 and RTS
 *   811E  4C 86 81  JMP $8186        expired      -> mode 2, the attract demo
 *
 * The countdown is seeded by `$8256`'s fall-through and RE-seeded by `$8220`
 * every time START or SELECT is pressed, so the demo cannot start within 256
 * frames of the player touching the pad.
 */
export function st8116(state, res) {
  drawCursor(state, res);                           // $8116 JSR $82A1
  if (tickMenuTimer(state)) {                       // $8119/$811C BNE $8111
    state.ppu.chrSel = 3;                           // $8111/$8113
    return;
  }
  advanceMode(state);                               // $811E JMP $8186 -> mode 2
}

/**
 * MODE 2 -- `$8121`. THE ATTRACT DEMO: a real mode-5 frame with a scripted pad.
 *
 *   8121  A6 01 / D0 05      phase != 0 -> $812A
 *   8125  E6 01              phase := 1
 *   8127  4C C7 82  JMP $82C7        one-life demo game, RAM wiped
 *   812A  20 4D 96  JSR $964D        <- $9C6D, then FALL INTO $9650
 *   812D  A5 0B / F0 E4      $0B == 0 -> $8115 RTS
 *   8131  A9 00 / 85 01 / F0 58 -> $818F with A = 0: back to mode 0
 *
 * `$964D` IS A ONE-INSTRUCTION PROLOGUE IN FRONT OF `$9650`:
 *
 *   964D  20 6D 9C  JSR $9C6D
 *   9650  A9 0C     LDA #$0C      <- st_9650, the mode-5 entry
 *
 * so the attract demo is not a separate simulation. It is the game, called as a
 * SUBROUTINE (it returns to `$812D`, unlike mode 5's own dispatch which arrives
 * through `$83E4`'s stack trick), with `$05`/`$07` overwritten first and `$09`
 * set so that scoring, the BGM change and pause are all suppressed.
 *
 * `$0B` is the demo's only way out and it has exactly two producers: `$9CB1`
 * (the script ran off its end, or the player pressed START/SELECT) and `$9809`
 * (the demo ship died -- `$97F1`'s `$09 != 0` arm).
 */
export function st8121(state, res, stagePlay) {
  if (state.zp01 === 0) {                           // $8121/$8123 BNE $812A
    state.zp01 = u8(state.zp01 + 1);                // $8125 INC $01
    startDemo(state);                               // $8127 JMP $82C7
    return;
  }
  demoInput(state, res);                            // $812A -> $964D JSR $9C6D
  stagePlay(state, res);                            //   ...and FALL INTO $9650
  if (state.zp0B === 0) return;                     // $812D/$812F BEQ $8115
  state.zp01 = 0;                                   // $8131/$8133 STA $01
  setMode(state, 0);                                // $8135 BEQ $818F with A = 0
}

/**
 * MODE 3 -- `$8137`. START WAS PRESSED: the jingle, then 80 frames of blinking.
 *
 *   8137  A6 01 / D0 09          phase != 0 -> $8144
 *   813B  A9 90 / 20 1E EC       sfx $90, the "game start" jingle
 *   8140  A9 50 / D0 39 -> $817D  $4C := $50 (80), then $817F INC $01 / RTS
 *   8144  CA / D0 18             phase >= 2 -> $815F
 *   8147  C6 4C / F0 34          $4C hit 0 -> $817F, phase := 2
 *   814B  A9 01 / 18 / 65 0F / 85 98      $98 := 1 + $0F  -- packet 1 or 2
 *   8152  A9 08 / 25 4C / 0A x4 / 05 98   ...OR $80 when bit 3 of $4C is set
 *   815C  4C E8 85  JMP $85E8
 *   815F  20 D5 82  JSR $82D5    the real game's RAM setup
 *   8162  4C 86 81  JMP $8186    -> mode 4
 *
 * THE BLINK IS BIT 3 OF THE COUNTDOWN, shifted into bit 7 of the packet index:
 * `$08 AND $4C` is 8 or 0, four `ASL`s make that $80 or $00, and bit 7 of a
 * canned-packet index selects src/hudpackets.js's BLANKER -- the same packet
 * with everything after its first two bytes replaced by $00. So the selected
 * menu line erases and redraws every 8 frames, five times, and the packet is
 * `1 + $0F`: packet 1 is the 1 PLAYER line, packet 2 the 2 PLAYERS line.
 *
 * This is the FIRST caller in the port to exercise that blanker. src/hudpackets
 * has carried it as "NOT EXERCISED BY ANY MEASURED FRAME, transcribed from the
 * listing" since W2.
 */
export function st8137(state, res) {
  if (state.zp01 === 0) {                           // $8137/$8139 BNE $8144
    soundRequest(state, 0x90);                      // $813B/$813D JSR $EC1E
    state.zp4C = 0x50;                              // $8140 -> $817D STA $4C
    state.zp01 = u8(state.zp01 + 1);                // $817F INC $01
    return;                                         // $8181 RTS
  }
  if (state.zp01 !== 1) {                           // $8144 DEX / $8145 BNE $815F
    newGame(state);                                 // $815F JSR $82D5
    advanceMode(state);                             // $8162 JMP $8186 -> mode 4
    return;
  }
  state.zp4C = u8(state.zp4C - 1);                  // $8147 DEC $4C
  if (state.zp4C === 0) {                           // $8149 BEQ $817F
    state.zp01 = u8(state.zp01 + 1);                // $817F INC $01
    return;
  }
  const idx = u8(1 + state.zp0F);                   // $814B-$8150 STA $98
  const blank = u8((0x08 & state.zp4C) << 4);       // $8152-$8159 ASL A x4
  cannedPacket(state, res.hudPackets, u8(blank | idx));  // $815A/$815C JMP $85E8
}

/**
 * MODE 4 -- `$8165`. Three instructions, and it is the whole handover to play.
 *
 *   8165  A9 00 / 85 1B      $1B := 0 -- the stage intro's first state
 *   8169  4C 86 81  JMP $8186        mode := 5
 *
 * src/main.js's `introEntryState()` has been asserting exactly this since W4;
 * it is now produced rather than asserted.
 */
export function st8165(state) {
  state.substate = 0;                               // $8165/$8167 STA $1B
  advanceMode(state);                               // $8169 JMP $8186 -> mode 5
}

/**
 * MODE 6 -- `$816C`. Two RAM clears, mask `$03`, and go back to mode 0.
 *
 *   816C  20 18 84  JSR $8418        clear $0100-$017F
 *   816F  20 24 84  JSR $8424        clear $0020-$0097
 *   8172  A5 03 / 29 0F / 85 03      keep only the low nibble of the config
 *   8178  4C 31 81  JMP $8131        -> $01 := 0, then $818F with A = 0
 *
 * `$8131` is mode 2's own tail, so this ends exactly where an attract demo ends:
 * `$00 := 0`, `$4C := $20`, `$0B := 0`, `$01 := 0`.
 *
 * See the file header for why this runs and cannot currently be reached.
 */
export function st816C(state) {
  clear0100(state);                                 // $816C JSR $8418
  clear0020(state);                                 // $816F JSR $8424
  state.zp03 = u8(state.zp03 & 0x0F);               // $8172-$8176
  state.zp01 = 0;                                   // $8178 -> $8131 STA $01
  setMode(state, 0);                                // $8135 BEQ $818F with A = 0
}

/**
 * `$80C0`-`$80D1` -- the pre-dispatch and the jump table.
 *
 *   80C0  A5 00 / C9 03 / B0 09      mode >= 3 -> skip the input handler
 *   80C6  A5 03 / 29 40 / D0 03      config bit 6 set -> skip it too
 *   80CC  20 1A 82  JSR $821A
 *   80CF  A5 00     LDA $00          <- RE-READ: $8251 may have just changed it
 *   80D1  20 E4 83  JSR $83E4        -> jt_80D4
 *
 * The re-read at `$80CF` is not redundant. `$8248` sets the mode to 1 in the
 * middle of an attract frame, and the `LDA` is what makes that take effect on
 * THIS frame rather than the next -- so pressing START during the demo shows the
 * title menu immediately, and `$8121` never runs on that frame.
 *
 * `stagePlay` is handed in rather than imported so that the module graph stays
 * acyclic: entry 5 of the table is `$9650`, which lives in src/nmi.js because
 * two of its arms re-enter the mode-5 body.
 */
export function modeDispatch(state, res, stagePlay) {
  if (state.mode < 3 && !(state.zp03 & 0x40)) {     // $80C0-$80CA
    sub821A(state, res);                            // $80CC JSR $821A
  }
  switch (state.mode) {                             // $80CF/$80D1 -> jt_80D4
    case 0: return st80E2(state, res);              // $80D4 -> $80E2
    case 1: return st8116(state, res);              // $80D6 -> $8116
    case 2: return st8121(state, res, stagePlay);   // $80D8 -> $8121
    case 3: return st8137(state, res);              // $80DA -> $8137
    case 4: return st8165(state);                   // $80DC -> $8165
    case 5: return stagePlay(state, res);           // $80DE -> $9650
    case 6: return st816C(state);                   // $80E0 -> $816C
    default:
      // $83E4 indexes a SEVEN-entry table with (A*2)+1 and does not bound it, so
      // an eighth mode reads $80E2's own opcodes as a pointer. The port says so
      // instead of reproducing it.
      throw new Error(`$80D1 JSR $83E4: game mode $00 = ${state.mode} is past `
                    + `jt_80D4's seven entries ($80E2 $8116 $8121 $8137 $8165 `
                    + `$9650 $816C)`);
  }
}
