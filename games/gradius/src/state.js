// Gradius (NES) -- the machine's RAM, as a plain JS object tree.
//
// Gradius has NO MAIN LOOP. RESET ends at $8067 with `JMP $8067`, an empty
// spin; everything runs inside the NMI handler at $806A. So there is no
// "update" and no "draw" -- there is one frame function, src/nmi.js, and this
// file is the state it reads and writes.
//
// Naming rule for this port: every field carries the RAM address it stands for
// in a comment, and the address is the primary name. Where the ROM keeps a
// 16-bit quantity in two bytes we keep the two bytes, because the ROM's
// arithmetic is 8-bit and WRAPS -- see player.js's `ADC #$02` at $A009, which
// is the reason a speed level of 255 makes the ship SLOWER, not faster.
//
// Evidence for every address below: NOTES-player.md 2, NOTES-terrain.md 1-5,
// NOTES-render.md 0-5, tools/oracle/PROBE.md 4.

/** unsigned 8-bit wrap */
export const u8 = (v) => v & 0xFF;
/** unsigned 16-bit wrap */
export const u16 = (v) => v & 0xFFFF;
/** signed 8-bit reinterpretation */
export const i8 = (v) => (v << 24) >> 24;

/**
 * Buttons, as the ROM's joypad reader leaves them in $0007 (held) and $0005
 * (pressed). MEASURED by A/B RAM diff, not by citing the NES standard order:
 * RIGHT $01, LEFT $02, DOWN $04, UP $08, START $10 (PROBE.md 4). Bit 7 is the
 * A button -- read at $A0FC (`AND #$80` on $05) and $A102 (on $07).
 *
 * Note the low nibble is *direction*, which is what makes `AND #$0F` at $A082
 * a single test for "is any direction held".
 */
export const BTN = {
  RIGHT: 0x01, LEFT: 0x02, DOWN: 0x04, UP: 0x08,
  START: 0x10, SELECT: 0x20, B: 0x40, A: 0x80,
};

/**
 * Object slots on page $0300, and WHO OWNS WHICH.
 *
 * Read straight off the allocators rather than inferred from what happened to
 * be occupied (00-recon-enemies.md 0):
 *
 *   0      player                     NOTES-player.md
 *   1-2    the two Options            NOTES-player.md
 *   3-5    shot A  (player + 2 Options)   $0123,X with X = 0..2
 *   6-8    shot B                         $0126,X
 *   9-11   missiles                       $0129,X
 *   12-21  ENEMIES                    $A527 `LDA $A8 / ADC #$0C / TAX`, and
 *                                     $ADB3 `LDX #$09` -- ten of them
 *   22-31  enemy bullets              $C327 `LDA #$0A / ADC $A8 / TAX`, the
 *                                     SAME free routine at index + 10
 *
 * ENEMY_BASE is spelled once, here, because every enemy address in the ROM is
 * written with the +$0C folded into it (`$030C,X`, `$032C,X`, ...) with X being
 * the enemy INDEX 0..9, not the slot.
 */
export const SLOTS = 32;
export const ENEMY_BASE = 0x0C;   // $A534 ADC #$0C
export const ENEMY_SLOTS = 10;    // $ADB3 LDX #$09

/** Ring length, from `CMP #$18` at $A08C. */
export const RING_LEN = 0x18;

/**
 * The mode-5 (stage play) constants the state machine needs. $00 is the game
 * mode; the dispatch is the Konami inline jump table at $80D1/$80D4.
 */
export const MODE_STAGE = 5;

export function createState() {
  return {
    // ---- the frame heartbeat ------------------------------------------
    // $04 is the FRAME LOCK. The NMI reads it at $8073 and bails outright if
    // it is non-zero, raises it at $809F and clears it at $80B5. A lag frame
    // on this machine therefore skips OAM DMA and the PPU register writes too
    // -- it is VISIBLE, unlike the Game Boy case (NOTES-lag.md).
    lock: 0,                 // $04
    frame: 0,                // $02   INC at $80BE, free-running
    lagFrames: 0,            // census, not a ROM byte
    // NMIs the frame just finished caused to be DROPPED, because its own work
    // overran the vblank and $8073 found $04 still set. Not a RAM byte -- it is
    // the port's model of a cycle cost it does not otherwise have, and it
    // exists because exactly one frame in every measured run pays it:
    //
    //   probe/objloop, boot "200:,10:S,190:"       lag.dropAtGameFrame = 283
    //   the same script + ",300:R" (a death)       283 and 614
    //
    // 283 is the frame that runs $9B3E and 614 is the respawn's -- i.e. both
    // are the frame that runs $882C, the full-screen RLE load, 2304 $2007
    // writes in one NMI. objloop.lua attributes the drop to the frame that was
    // still running, so it belongs on THAT frame's row and does not consume a
    // row of its own (porttrace.mjs `lagged`). src/flow.js sets it; src/nmi.js
    // clears it at the top of the next frame.
    frameDrops: 0,

    mode: MODE_STAGE,        // $00   game mode; 5 = stage play
    substate: 0x80,          // $1B   mode-5 sub-state; see nmi.js on the gate
    // Three gates, one of which stopped being a constant in wave 4.
    //
    //   $5C >= 2  halves the player's update rate ($9A5E/$969A). Stage-5 only:
    //             $9650 only computes it when $19 == 4 (00-recon-flow.md 3),
    //             and src/nmi.js throws on $19 == 4 before it gets there.
    //   $15       PAUSE, and LIVE PORT STATE since wave 4: $9ADA toggles it on
    //             a START EDGE and $9650's first branch then jumps the whole
    //             update to $9A8C (src/flow.js pauseCheck). The `pause`
    //             scenario drives it 0 -> 1 at frame 450 and 1 -> 0 at 500 and
    //             compares all 50 frozen frames against the cartridge.
    //   $5B       uncharacterised: eleven INC sites, three readers ($9A9C,
    //             $9ACA, $AEDD), 0 at every sample point of every measured run.
    //             The port writes it in exactly one place -- $9B25, on the
    //             unpause -- and that value is provably dead: $9AD1 is the last
    //             thing a mode-5 frame does and $9658 is the fourth instruction
    //             of the next one.
    //
    // WHAT $15 AND $5B ACTUALLY DO, because this file said the wrong thing for
    // the port's whole life: they skip `JSR $98EE`, the CAMERA ADVANCE, and
    // nothing else. The ROM is
    //     9A98  A5 15     LDA $15
    //     9A9A  D0 07     BNE $9AA3    -- lands PAST the JSR, ON the split
    //     9A9C  A5 5B     LDA $5B
    //     9A9E  D0 03     BNE $9AA3
    //     9AA0  20 EE 98  JSR $98EE
    //     9AA3  AD 02 20  LDA $2002    -- the split, reached either way
    // so a paused frame still splits; it just does not scroll. That matches the
    // measurement from the other side: START at f450 froze $3E at 68 for 50
    // frames while the picture kept its two bands (00-recon-flow.md 8). What
    // suppresses the SPLIT is $9A88/$9A8C/$9A90/$9A94 -- see nmi.js.
    zp5C: 0,                 // $5C
    zp15: 0,                 // $15
    zp5B: 0,                 // $5B

    // ---- wave 4: the $96A5 ladder, the stage intro and pause ------------
    // $19, the STAGE INDEX. It used to be "the port has no $19" (porttrace.mjs
    // UNMODELLED), which was true while the only thing that read it was the
    // streamer's stage-4 collision skip. Wave 4 gave it three more readers, all
    // in src/flow.js: $9663 (`CMP #$04` -- the stage-5 half-rate arm), $9BF5
    // (the intro's second canned packet is 8 + $19) and $9B88 (`LDY $19` into
    // the start-position table). Nothing in the port WRITES it except $9B70,
    // which restores it from $26,X; it is 0 on every frame of every measured
    // run and the port throws rather than guess on anything else.
    zp19: 0,                 // $19
    // $17, the POWER-UP RANK. `$9C45` recomputes it from scratch at $9AC4 every
    // mode-5 tail: ($44 != 0) + $45 + ($46 != 0) + ($19 != 0), so 0..4 on stage
    // 1 and 0..6 anywhere. It is NOT in $9B3E's $3D-$97 wipe, so after a death
    // it holds its last computed value until the next $9AC4 -- the intro states
    // never reach one. Watched (w_0017) since wave 7; `capsule-sweep` drives it
    // 0,1,2,3,4. Its 23 readers are enemy-bullet aim/speed and hit points; the
    // one the plan named, $BBE5, is UNREACHABLE on stage 1 ($BBC1 BEQ $BBEC
    // when $19|$1A == 0) -- measured n=0 in the window where $17 = 4.
    zp17: 0,                 // $17
    // $4C, the general 16-bit timer's low byte. $C1D6 loads it with $78 at the
    // death (wave 5) and $96EF counts it out one per frame -- THAT half is
    // ported here, as structure, and reaching 0 throws with $979D's address.
    // $4D (the high byte) is not modelled: every use on the mode-5 path is
    // 8-bit ($96EF/$975B read $4C alone); $9A0E's 16-bit load is the
    // end-of-stage chain, which throws.
    zp4C: 0,                 // $4C
    // $09 the demo/attract flag, $16 uncharacterised. Both are gates on the
    // PAUSE handler ($9ADA `LDA $09 / ORA $16 / ORA $0D`) and nothing in the
    // port writes either; measured 0 on every frame of every play run and 1 for
    // $09 through the attract demo, which is not ported.
    zp09: 0,                 // $09
    zp16: 0,                 // $16
    // $0A, the bitfield of players still in the game: bit 0 = player 1, bit 1 =
    // player 2. Read at $97C7 by the respawn's player switch (wave 5) and
    // written only at $97F9, the game-over arm, which is a throw. MEASURED 1 in
    // the seed of all 28 scenarios, so the switch at $97C5-$97DB is a no-op and
    // $18 stays 0 -- exactly the same read-and-never-written arrangement as the
    // lives byte $20 (see SEEDED INPUTS below). Watched (w_000A) so that the
    // wave which does write it is judged against data recorded before it.
    zp0A: 0,                 // $0A
    // $33, the button-code match counter $9765 walks, and $3B,X, the per-player
    // count of cheat uses left. $9AFF runs the matcher on EVERY paused frame
    // (unless $3B,X is negative), which is why $33 is real port state rather
    // than a stub: see src/flow.js codeMatch().
    zp33: 0,                 // $33
    cheat: new Uint8Array(2),// $3B,X  ($9B15 DEC $3B,X, $B981 INC $3B,X)
    // $22/$24/$26/$28, indexed by $18: the per-player state the respawn saves
    // ($979D, src/flow.js respawn) and the stage intro restores ($9B62-$9B74).
    // WAVE 5 MADE ALL FOUR LIVE: $97AB writes $22,X = ($42 ? 1 : 0), $97AF
    // $26,X = $19, $97BB $24,X = min($3F AND $0E, 8) and $97BF $28,X = $1A, on
    // the frame the death countdown reaches 0. They are still 0 on every frame
    // of this corpus -- every death in it happens at $3F = 0 with no capsule
    // collected -- so what has teeth on the checkpoint formula is
    // tests/collision.test.js, which drives the recon's own three measured
    // inputs ($3F = 3 -> 2, 7 -> 6, $14 -> 4).
    save22: new Uint8Array(2),   // $22,X  the meter cursor to restore
    save24: new Uint8Array(2),   // $24,X  the checkpoint -> $3F and $55
    save26: new Uint8Array(2),   // $26,X  the stage    -> $19
    save28: new Uint8Array(2),   // $28,X  -> $1A
    // $1A: uncharacterised, and read by $BBBD (`LDA $19 / ORA $1A`) as half of
    // the test that decides how fast an enemy's shot countdown runs. Restored
    // at the respawn from $28,X ($979D). MEASURED 0 on every frame of every run
    // made here; src/enemies.js throws if it is not, rather than guessing which
    // of $BBC3-$BBEB's arms would run.
    zp1A: 0,                 // $1A

    // ---- input --------------------------------------------------------
    // $81BF at $80A4 writes both. INPUT LEAD IS ZERO: the read happens at
    // $80A4 and the state machine at $80AA, in the SAME NMI, so a button
    // pressed on frame N moves the ship on frame N (NOTES-player.md 10).
    input: {
      held: 0,               // $0007  (P1; $0008 is P2, $18 selects)
      pressed: 0,            // $0005  (edge)
      prev: 0,               // the shift register the edge is computed from
    },

    // ---- zero page the player reads -----------------------------------
    zp: {
      speed: 0,              // $40  SPEED level; INC $40 at $89A1
      missile: 0,            // $41  missile flag
      // $44: 0 normal / 1 LASER / 2 DOUBLE. NOT "1 double / 2 laser", which is
      // what this said and what NOTES-player.md 9 said: $89BB (the meter's
      // DOUBLE arm) stores 2 and $89CF (LASER) stores 1, and forcing $44 on the
      // cartridge gives type $06 sub 0 at 0, type $07 sub 1 at 1, and TWO
      // simultaneous shots ($06 sub 0 + $24 sub 2) at 2 (00-recon-weapons.md 0).
      weapon: 0,             // $44
      options: 0,            // $45  Option count, capped at 2 by $89D3
      autofire: 20,          // $35  autofire reload, MEASURED 20
      player: 0,             // $18  current player index; 0 or 1. Measured 0
      // $42, the power-up METER cursor: 0 = nothing selected, 1..6 = one of the
      // six cells, wrapped back to 1 at 7 by $894B. src/hud.js's $8A30 turns it
      // into the attribute byte $55 that highlights the cell. LIVE since wave 7
      // (src/powerup.js): $894B INCs it on a capsule and $8974's six arms clear
      // it -- except on an already-owned refusal, which KEEPS it, which is the
      // only way it is ever observable at the $80B5 sample point at all when B
      // is held. `capsule-pickup` holds it at 1 from f626; `capsule-sweep` holds
      // it at 2, 3, 4, 5 and 6 for twenty frames each.
      meter: 0,              // $42
      // $46, the shield's remaining hits: 5 when $8997 applies it, ONE PER
      // COLLISION at $C1C1, and the sixth hit dies through $C1D6. Read by $8A22
      // for the highlighted form of the last meter cell, by $9C45 for the rank,
      // and by $8B6B -- the sprite emitter draws a force field around the ship
      // on every shielded frame, which is an extra $8AAC and therefore moves the
      // COMPARED work counters. MEASURED on `capsule-shield`: 5 -> 4 -> 3 -> 2
      // -> 1 -> 0 at f493/509/526/542/647, and the sixth contact kills at f658.
      shield: 0,             // $46
      step: 0,               // $99:$98  the 16-bit sub-pixel step, scratch
      tilt: 1,               // $9B  tilt code for THIS frame, latched by $A0BE
    },

    // ---- page $0300: four parallel arrays, $20 apart -------------------
    // Proven by $A285/$A297: ONE add/subtract subroutine services both axes,
    // selected by the 6502 Y register -- Y=0 is the vertical axis, Y=$40 the
    // horizontal one, and $40 is exactly the distance between the arrays.
    //
    // WAVE 3 COMPLETED THE POOL. $A527 (`clearSlot`) is the authority on what
    // an object slot IS: it clears TWENTY-ONE arrays at X = $A8 + $0C, plus two
    // more at Y = $A8. All twenty-one are below, in $A527's own order.
    //
    // THE TWO "j-INDEXED ARRAYS" ARE NOT SEPARATE ARRAYS, and this is a
    // correction to 00-recon-enemies.md 8, which called them `$0460+j` and
    // `$0496+j` and warned that merging them with `$0460+j+12` would be wrong.
    // It is right that the BYTES differ; it is the framing that misleads. Do
    // the address arithmetic:
    //
    //     $A52B  STA $0496,Y   Y = j (0..9)  ->  $0496..$049F
    //     $A52E  STA $0460,Y   Y = j (0..9)  ->  $0460..$0469
    //     $A569  STA $0460,X   X = j+12      ->  $046C..$0475
    //
    // $0496 = $0480 + 22 and $0460 = $0460 + 0. So the first write is
    // `s0480[22 + j]` -- the ENEMY-BULLET slots' entry in the $0480 array --
    // and the second is `s0460[j]`, the SHOT slots' entry in the $0460 array.
    // Two different indices of two arrays that already exist, not two extra
    // arrays. Model them as extra arrays and the addresses stop matching the
    // cartridge's, which is what the watch list compares.
    //
    // PAGE $0300 IS NOT EIGHT ARRAYS OF 32. $03A0 and $03B0 are $10 apart, so
    // as 32-entry arrays they OVERLAP: carrier[16..21] ($03B0-$03B5) is the
    // same RAM as yvel[0..5]. Harmless and left alone, because every writer of
    // the $03B0 array in the ROM folds in the +$0C ($03BC,X, X = 0..9), so
    // $03B0-$03B5 is only ever touched as carrier[16..21]. peek() in
    // porttrace.mjs resolves the watched addresses explicitly for that reason.
    obj: {
      status: new Uint8Array(SLOTS), // $0100+i  1 = alive, >= 2 = dying/dead;
                                     //          for an ENEMY it is the $ADC1
                                     //          animation group, bit 7 = armoured
      anim: new Uint8Array(SLOTS),   // $0120+i  metasprite id; 0 = not drawn
      timer: new Uint8Array(SLOTS),  // $0140+i  animation timer
      // $0160+i, the animation frame / explosion-script selector. INDEX 0 IS
      // THE SAME BYTE AS `ring.cursor` ($0160, $A092 STA $0160): the ROM
      // overloads slot 0's animation-frame byte as the Options' position-ring
      // cursor. The port keeps ring.cursor authoritative and nothing writes
      // animFrame[0]; enemies only ever touch 12..21.
      animFrame: new Uint8Array(SLOTS),
      // $0180+i, OR'd into every OAM attribute byte at $8AE0. Read 0 for the
      // player on the captured frames, which is why its records' own $20/$21
      // reach OAM unchanged. $A579 sets it to 3 for a power-up carrier.
      attrMask: new Uint8Array(SLOTS),
      type: new Uint8Array(SLOTS),   // $0300+i  0 = FREE; bit 7 = initialised
                                     //          and collidable; type AND $7F is
                                     //          the $AE1C handler index
      y: new Uint8Array(SLOTS),      // $0320+i  integer pixels
      yf: new Uint8Array(SLOTS),     // $0340+i  1/256 px
      x: new Uint8Array(SLOTS),      // $0360+i  integer pixels
      xf: new Uint8Array(SLOTS),     // $0380+i  1/256 px
      // $03A0+i, and it means TWO different things in two different slot
      // ranges, exactly as the ROM's addresses do:
      //   i = 12..21  the CARRIER byte. 0 none, 1 drops a capsule, 2/3 = the
      //               squadron group id $49, seeded at $A456 for squadrons of
      //               >= 4 and turned into 1 by $BE93 when $0048+id reaches 0.
      //   i = 3..8    the AUTOFIRE TIMERS. $03A3,X and $03A6,X (X = 0..$45) are
      //               the per-object slot-A and slot-B reload counters the
      //               firing block at $A113/$A131 reads and DECs -- see
      //               src/weapons.js. They are FROZEN while the slot holds a
      //               shot, which is why the cadence is lifetime + $35.
      // One array, because $03A3 IS $03A0 + 3. A port that gives the timers
      // their own array stops matching w_03A3-w_03A8.
      carrier: new Uint8Array(SLOTS),// $03A0+i
      yvel: new Uint8Array(SLOTS),   // $03B0+i  Y velocity, integer
      yvelf: new Uint8Array(SLOTS),  // $03E0+i  Y velocity, fraction
      style: new Uint8Array(SLOTS),  // $0400+i  $A579's style AND $FE
      xvel: new Uint8Array(SLOTS),   // $0420+i  X velocity integer, OR the
                                     //          explosion script's cursor ($AEB2)
      xvelf: new Uint8Array(SLOTS),  // $0440+i  X velocity, fraction
      s0460: new Uint8Array(SLOTS),  // $0460+i  per-handler state / damage count
      s0480: new Uint8Array(SLOTS),  // $0480+i  sub-state / acceleration
      s04A0: new Uint8Array(SLOTS),  // $04A0+i  script index / hit counter
      s04C0: new Uint8Array(SLOTS),  // $04C0+i  UNIDENTIFIED: cleared by $A527
                                     //          and no reader has been found
      s04E0: new Uint8Array(SLOTS),  // $04E0+i  $A579's style AND $FE, again
    },

    // ---- the 24-entry position ring the Options trail through ---------
    ring: {
      cursor: 0,                     // $0160
      x: new Uint8Array(RING_LEN),   // $07A0-$07B7
      y: new Uint8Array(RING_LEN),   // $07C0-$07D7
    },

    // ---- the HUD ($8898 and its four producers, src/hud.js) -------------
    //
    // SEEDED INPUTS, AND HOW MUCH OF THAT IS LEFT: NOTHING.
    // The producers read six things: the two lives bytes, the three BCD
    // scores, $42 and $46. They were ALL seeded when wave 2 landed, because
    // nothing in the corpus then scored, died or collected a capsule.
    //
    //   lives $20,X   COMPUTED since wave 5 ($979D's DEC, and $84F0's INC in
    //                 src/score.js). tests/collision.test.js broke it and
    //                 w_0706 -- a queue byte the lives producer wrote -- went
    //                 red two frames after w_0020.
    //   score $07E0+  COMPUTED since wave 6: $8463 adds $0010 per kill through
    //                 src/score.js, and the three autofire scenarios compare
    //                 w_07E4-w_07E6 AND the row-29 digits $892C draws from them
    //                 on every frame of a window that contains 11 to 18 kills.
    //   $42 / $46     COMPUTED since wave 7 (src/powerup.js $894B/$8974, and
    //                 $C1C1's DEC in src/collision.js). Five scenarios move
    //                 them; `capsule-die` also proves the death interaction --
    //                 $35 lost, $42 restored from $22,X.
    //
    // The initial VALUES are still the cartridge's, out of the align frame's
    // RAM (porttrace.mjs seedFromRam, src/main.js bootState) -- that is what
    // makes the comparison absolute rather than relative, and it is the same
    // arrangement the camera and the sub-pixel accumulators have.
    //
    // $48 is different: it is REAL STATE, incremented by $88A4 on every odd
    // frame, and it is watched (w_0048).
    zp48: 0,                 // $48   the four-phase HUD rotation, $88A4 INC $48
    lives: new Uint8Array(2),// $20,X for player $18. MEASURED 3 at align 400
    // $07E0-$07EB: three 3-byte BCD scores on a 4-byte stride -- $07E0 TOP,
    // $07E4 player 1, $07E8 player 2, each stored most-significant byte LAST
    // ($88FD reads $07E0,Y for Y = 2, 1, 0). MEASURED at align 400:
    // 00 50 00 = the 50000 the attract mode leaves as TOP, and zero for both
    // players. src/score.js ($845B/$8463/$8474) is the adder, live since wave 6.
    score: new Uint8Array(12),
    // $2A,X -- the score at which player X gets an extra life, one BCD byte
    // (the HIGH byte of the 3-byte score is what $84D9 compares it against).
    // MEASURED $02 in the seed of every scenario, and the biggest score any
    // window here reaches is $0110, so $84D3's arm is ported and unexercised.
    // It is the only thing in the game that INCREASES $20,X.
    extraLife: new Uint8Array(2),
    // Sound requests THIS FRAME, in the order $EC1E was called. Not a RAM byte
    // and not the driver's state either: `$A266 LDA $99 / JMP $EC1E` is the
    // shared tail of BOTH shot spawns, so a DOUBLE volley with two Options
    // requests six sounds in one frame, and $BE93, $C1D6 and $84F2 add their
    // own. It stayed after wave 8 ported the driver, because it is what
    // tests/weapons.test.js and tests/powerup.test.js hold the CALL SITES to,
    // independently of whether the driver then accepts the request (73 of 83
    // shot SFX are REJECTED on priority in the measured window -- see
    // src/sound.js). src/nmi.js clears it at the top of every frame.
    sfx: [],

    // ---- the sound driver, $EC1E / $ED02 (src/sound.js) ------------------
    //
    // $00B0-$00FF AS ONE FLAT ARRAY, indexed by address. Four 17-byte channel
    // structs at $B0 $C1 $D2 $E3 ($ECB2), then the driver's own scratch -- and
    // the structs DELIBERATELY OVERLAP the globals, which is why this is one
    // array and not four objects plus some fields:
    //
    //   $DD/$DE  is $D2 + $0B and $D2 + $0C, the TRIANGLE's sweep and detune
    //            bytes. The triangle never executes the $10/$11 commands
    //            ($EDDD CPX #$D2), so the two bytes are reused as the ONE
    //            GLOBAL sub-phrase return address, shared by all four channels.
    //   $F0-$F3  is $E3 + $0D..$10, the NOISE struct's unused tail, reused as
    //            the music-fade globals.
    //
    // MEASURED (00-recon-sound.md 8d, RAM taps gated on the $ED02..$80A4
    // window): the driver's entire footprint is its own structs, $15 and the
    // stack. It reads no object table, no sprite count and no collision state,
    // which is why nothing else in this port has to know it exists.
    snd: new Uint8Array(0x50),      // $00B0-$00FF

    // $01A0-$01B0 -- where $9AF0 copies PULSE 1's whole struct on the pause and
    // $9B33 copies it back on the resume. Only pulse 1, because only pulse 1 is
    // overwritten: the pause jingle $3B's record targets it and the driver's
    // freeze arm leaves the other three counters exactly where they were.
    sndSave: new Uint8Array(0x11),

    // $1C -- the background-music de-dupe byte. NOT a driver byte: $839B
    // compares the code it is about to play against it and returns without
    // requesting anything if they match, and $97DD (the respawn) clears it so
    // the next intro's music starts again. Cleared by $97DD, written by $839F.
    zp1C: 0,

    // $4000-$4017 as a write-only shadow. It is NOT comparable against the
    // cartridge (the registers cannot be read back, and this side starts from
    // zero where the machine's has history) -- what IS compared is the count
    // and the rolling digest of the writes MADE each frame, in work below.
    apu: new Uint8Array(0x18),

    // ---- the enemy spawn engine's zero page ($A2C0, src/enemies.js) -----
    //
    // Kept as the ROM's individual bytes, including the 16-bit wave cursor
    // $6A:$6B, which is a REAL CPU POINTER into the wave lists and a compared
    // field: 00-recon-enemies.md 1 recorded it stepping $A846 -> $A848 -> ...
    // as each record fired, and this port reads its tables at CPU addresses so
    // that stays true (src/assets.js enemyTables).
    spawn: {
      z5D: 0,     // $5D  INC at $A335 whenever a wave record fires. Also read by
                  //      $BBB7: while it is 0 the enemy-bullet engine runs its
                  //      $BBE5 arm instead. It is >= 1 from frame 378 of stage 1.
      z60: 0,     // $60  engine state: 0 = idle, 1 = load the chunk table, 2 = run
      z61: 0,     // $61  = $3F AND $0E ($A2E1), the 512-px chunk, used as a BYTE
                  //      offset into the stage's chunk table
      z64: 0,     // $64-$67, the four descriptor bytes $A397 copies out of table
      z65: 0,     //      A or table B. For a formation: status, type, formation
      z66: 0,     //      index ($A592), pattern index ($A5BC).
      z67: 0,
      z69: 0,     // $69  formation members still to emit
      z6A: 0,     // $6A:$6B the wave-list cursor, advanced 2 at a time by $8402
      z6B: 0,
      z6C: 0,     // $6C  frames until the next member. Loaded at $A42F -- AFTER a
                  //      successful allocation, which is why a squadron that
                  //      cannot allocate burns its whole count in consecutive
                  //      frames (00-recon-enemies.md 4, measured).
      z6D: 0,     // $6D  the squadron's spawn X ($A592 b0 AND $F0)
      z6E: 0,     // $6E  the running Y, += dY per member
      z6F: 0,     // $6F  the member count, kept after $69 counts down
      zA8: 0,     // $A8  THE INDEX. The spawn engine's allocators and the update
                  //      loop both keep the enemy index 0..9 here, and $AEE1 /
                  //      $B251 reload X from it rather than trusting the caller.
      zAE: 0,     // $AE:$AF set to $0080 at $ADAB every frame. NO READER FOUND --
      zAF: 0,     //      00-recon-enemies.md's open question; reproduced anyway.
    },
    // $47 and $49, and the squadron kill counters at $0048+$49.
    //
    // $0048,Y is written at $A400 with Y = $49, and $A3FB forces $49 = 2 or 3
    // (`AND #$01 / ORA #$02`), so indices 0 and 1 of this array -- which would
    // be $48, the HUD's four-phase rotation, and $49 itself -- are PROVABLY
    // unreachable. They exist so the index arithmetic below is the ROM's.
    zp47: 0,                    // $47  INC at $AEC8; every 16th capsule is gold
    zp49: 0,                    // $49  the alternating squadron group id, 2 or 3
    squad: new Uint8Array(4),   // $0048-$004B

    // ---- the camera ----------------------------------------------------
    // $98EE adds #$80 to $3D per frame and carries into $3E/$3F through the
    // house 16-bit adder $8402. Base scroll is EXACTLY 1/2 px per frame:
    // measured, cam24 advanced by exactly $80 on all 3207 frames $98EE ran
    // (NOTES-terrain.md 1).
    cam: { sub: 0, lo: 0, hi: 0 },   // $3D / $3E / $3F

    // ---- the PPU shadows -----------------------------------------------
    // These are what $8281 pushes at the TOP of the NEXT NMI, which is why
    // the hardware scroll is always one frame behind $3E. $9A79 loads $12
    // from $3E during frame N; $8281 stores it during frame N+1. Measured
    // 3206/3206 for $12[N] == $3E[N-1], and only 1603/3206 for $3E[N].
    ppu: {
      ctrl: 0xA8,            // $10 -> $2000. $A8 = NT $2000, bg pat $0000,
                             //      spr pat $1000, sprites 8x16, NMI on
      mask: 0x1E,            // $11 -> $2001. bg+spr on, leftmost 8 px shown
      scrollX: 0,            // $12 -> $2005 (first write)
      scrollY: 0x0C,         // $13 -> $2005 (second). 12 during stage 1, $9650
      chrSel: 0,             // $2D  index into the CNROM table $8AA8
      blank: 0,              // $0D  blank-screen countdown, gates PPUMASK
      // Non-zero puts the live sprite-0 record at $0200 ($8B2F takes
      // $8B08+4 = CE 6D 23 F8); zero parks it off-screen at $F4. The split at
      // $9AA3 spins on that sprite's hit, so it is structural, not decoration.
      // DERIVED from $1E/$1F by $8B1A-$8B2B (src/oam.js), not stored by the ROM.
      spriteZeroOn: true,
    },

    // $1E and $1F, the sprite-0 pair. Both are REAL BYTES now (they used to be
    // the single boolean above, which could not express $9A8C/$9A90 and left
    // w_001E/w_001F permanently SKIPPED in the comparison). $8B1A-$8B2B writes
    // them both every frame from $1F alone:
    //   $1F == 0        -> $1E = 0, sprite 0 parked off-screen
    //   $1F == 1        -> $1F := 2, $1E = 0, LIVE record copied. One frame of
    //                      live sprite 0 with the split still suppressed --
    //                      the handover, and the only reason $1E is a separate
    //                      byte at all.
    //   $1F >= 2        -> $1E = 1, live record
    // MEASURED: $1E = 1 and $1F = 2 on every compared frame of the eighteen
    // PLAY scenarios. It is not outside the corpus any more: `intro-boot`
    // compares frames 283-639, over which $1F is 0 for the whole intro
    // ($882C's $883F STA $1F), 1 on frame 309 ($9C38, the handover) and 2 from
    // 310 -- produced by the port, not poked. `s0-handover` still injects the 1
    // into a mid-play window, where nothing else can.
    zp1E: 1,                 // $1E
    zp1F: 2,                 // $1F

    // The registers as they were LATCHED for the frame just drawn. $8281's
    // write is what drew it; reading $12/$13/$10 at the $80B5 sample point
    // gives you the NEXT frame's scroll and a renderer one frame early
    // (NOTES-render.md 1). The renderer reads THIS, never `ppu`.
    bandA: { ctrl: 0xA8, mask: 0x1E, scrollX: 0, scrollY: 0x0C, chrBank: 0 },
    bandB: { ctrl: 0xA8, chrBank: 1, ran: false },

    // ---- VRAM ------------------------------------------------------------
    // The queue at $0700 with cursor $0E, drained by $8A51 from the NMI at
    // $8099. Exactly ONE routine writes the nametable during gameplay --
    // proven by a census of every $2007 write over 600 frames.
    vram: {
      // $0700-$07FF, the queue page ITSELF -- a real 256-byte image, not a list
      // of packet objects. It has to be: $8898's producers patch bytes they
      // have already appended ($88E5 STA $06FE,Y, $8A48 STA $0700,X) and build
      // one open run out of six separate $85F3 copies. See src/vram.js.
      q: new Uint8Array(256),        // $0700-$07FF
      // $0E, the byte cursor into it. An 8-BIT byte: X is 8-bit and $0700 is
      // one page, so it wraps at 256 ($864A INX / $864B STX $0E).
      cursor: 0,                     // $0E
      nt: new Uint8Array(0x1000),    // PPU $2000-$2FFF (vertical mirroring)
      pal: new Uint8Array(32),       // PPU $3F00-$3F1F
    },

    // ---- the terrain streamer -------------------------------------------
    build: {
      lo: 0,                 // $54  world X of the 128 px half-page being built
      hi: 0,                 // $55
      prog: 0,               // $58  = blockCol*32 + blockRow inside it
      // $3A: the STAGE-ADVANCE LATCH, not an uncharacterised flag. Written in
      // exactly three places -- $96D7 and $97E1 (STA $3A, A = 0, both stage
      // init) and $993D (INC $3A, in the stage-end block that also does INC $19
      // and $3F = 0). While it is up the streamer, the enemy spawner ($A2C0)
      // and $C42D/$C68A/$C6B1 all stand down. MEASURED 0 on 700 of 700 frames
      // of a boot-and-play run: it never rises during stage 1.
      gate: 0,               // $3A
      // $57: a RESULT flag, written by the streamer itself -- 0 at $9D90 on
      // every frame that passes the queue gate, INC'd at $9DAF when the 384 px
      // lead throttles the build. It used to be seeded and then frozen here,
      // which is why w_0057 is in the knownFail list.
      ahead: 0,              // $57
    },

    // The terrain collision map, $0500-$06FF. NOT a second table and NOT
    // precomputed: it is derived at $9F55 from the tile indices the streamer
    // has just queued, by thresholding. The ordering is observable -- the map
    // for a column exists only once that column has been queued.
    coll: new Uint8Array(0x200),     // $0500-$06FF

    // ---- sprites ----------------------------------------------------------
    // Shadow OAM at $0200-$02FF, DMA'd at $8087 at the TOP of the NMI, so the
    // list built during frame N reaches the PPU on frame N+1.
    shadowOam: new Uint8Array(256),  // $0200
    hwOam: new Uint8Array(256),      // what the PPU is actually showing
    oamCursor: 0,                    // $36  the -15-slot write cursor
    oamBase: 0,                      // $2F  rotated +$44 a frame -- the flicker

    // ---- work counters, not RAM -------------------------------------------
    // NOT a diagnostic side channel: NOTES-lag.md names "object slots processed
    // per frame" as the detector for lag model (C), partial completion of the
    // object loop, and says it must be carried as a COMPARED field. The four
    // numbers below are counted in the port's real loops (src/oam.js) and are
    // held against the cartridge's own execution counts, taken with exec hooks
    // on $8B4D / $8AAC / $8ACF / $8AF9 by tools/oracle/objloop.lua. They are
    // reset at the top of every display-list build.
    work: {
      slotsVisited: 0,     // $8B4D executions -- iterations of the 32-slot loop
      msExpanded: 0,       // $8AAC entries    -- metasprites expanded
      spriteRecords: 0,    // $8ACF executions -- 4-byte records considered
      spritesStored: 0,    // $8AF9 executions -- records that reached OAM
      // $ADE5 entries -- iterations of the ENEMY loop. docs/knowledge/06's
      // mechanism (C), partial completion of an object loop, is answered NO for
      // this loop and the answer is MEASURED, not assumed: 15900 $ADE5 entries
      // over 1590 $ADAB calls on a 1900-frame stage-1 run = exactly 10.00, and
      // 26630 over 2663 on the recon's 3000-frame run. The loop is
      // `LDX #$09 / ... / DEC $A8 / BPL`, with no early exit at all.
      enemySlots: 0,

      // ---- the sound driver, wave 8 (src/sound.js) ----------------------
      // docs/knowledge/06's rule that the signals are instrumented SEPARATELY
      // rather than inferred from one "lag" boolean. All four are counted in
      // the port's own code and compared per frame against the cartridge's own
      // execution counts, taken by tools/oracle/objloop.lua.
      //
      //   audioTicks     $ED02 entries. THE LAG RULE: the frame lock's bail at
      //                  $8073 is upstream of $80A1, so a dropped NMI drops a
      //                  music tick. MEASURED, 600 game frames: nmiEntries 601,
      //                  lagFrames 1, driverCalls 600 -- driverCalls ==
      //                  nmiEntries - lagFrames.
      //   audioChannels  $ED46 entries. 0..4 owned channels PLUS every control
      //                  command chained inside the tick ($ECE5 re-enters $ED46
      //                  by BNE, not by JSR), so it varies frame to frame.
      //   apuWrites      writes to $4000-$400F. $4014 (OAM DMA) and
      //                  $4015/$4017 (once per run, $81AD/$81B2) are outside
      //                  the range on purpose.
      //   apuDigest      a rolling hash of (offset, value) over those writes,
      //                  in order: h = (h*31 + (off<<8) + v) & $FFFF. This is
      //                  the register-level comparison -- the shadow itself
      //                  cannot be compared, the writes can.
      audioTicks: 0,
      audioChannels: 0,
      apuWrites: 0,
      apuDigest: 0,
    },
  };
}
