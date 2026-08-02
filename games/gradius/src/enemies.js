// THE ENEMIES. ROM: the spawn engine `$A2C0` (called from $9A64), the enemy
// bullet engine `$BBB7` ($9A67), and the update loop `$ADAB` ($9A6D).
//
// Everything below is a transcription. Where a line is not obvious it carries
// the ROM address, and where a number was MEASURED on the cartridge the
// measurement is kept next to it (00-recon-enemies.md, plus this wave's own
// re-runs -- a number is not a fact until it is measured, and every figure the
// recon reported was re-measured here before it was written into code).
//
// ============================ THE FIVE THINGS A PORT GETS WRONG ==============
//
// 1. `$A36B BMI $A3B1` and `$A378 BMI $A3E4` ARE NOT TESTS OF THE DESCRIPTOR.
//    They test the N flag left by the loader's final `DEY`, which always ends
//    at $FF, so BOTH ARE ALWAYS TAKEN. Stage 1's descriptors have $64 = $01 and
//    $64 = $00 -- bit 7 CLEAR -- and the branches were still taken; measured
//    `total.tabB = 11`, `total.formSetup = 11`, `total.raw5 = 0`. They are
//    written as unconditional calls below. Do not "fix" them.
//
// 2. THE ALLOCATORS SCAN DOWNWARD, from index 9. Slot 21 fills first. That is
//    not a detail: $8B47 builds the display list walking slots 0 -> 31, so the
//    scan direction decides sprite priority and which sprites the 8-per-line
//    limit drops. Measured: firstNonZeroType = 21:378 20:389 19:400 18:411.
//
// 3. AN ALLOCATION FAILURE IS GAMEPLAY, NOT AN ERROR. The member is dropped,
//    `$69` is still decremented, and `$6C` is NOT reloaded -- it loads at $A42F,
//    which is past the failure return. So a squadron that cannot allocate burns
//    its whole count in CONSECUTIVE FRAMES instead of over 44. Measured by
//    poking all ten type bytes non-zero: 12 failures, 0 successes, `$6C` = 0
//    throughout.
//
// 4. BIT 7 OF `$030C+i` IS AN "INITIALISED" FLAG AND ALSO THE COLLISION GATE.
//    A handler's first update only sets it and returns, so an enemy is
//    motionless AND untouchable for exactly its spawn frame ($C011 `LDA $030C,Y
//    / BPL` skips the shot sweep). `$83E4` does `ASL A` in 8 bits, so type $85
//    and type $05 run the SAME handler -- proved by counting, not by reading:
//    hdlr05 hits 4840 == typeHist[5] 32 + typeHist[133] 4808, exactly.
//
// 5. TWO HANDLERS FALL THROUGH INTO EACH OTHER. Type 2's explosion player
//    ($AE99) ends at $AEDA `DEC $014C,X` and runs straight on into type 1's
//    $5B freeze check ($AEDD) and then type 3's mover ($AEE1). It is written as
//    a fall-through here, because that is what it is (docs/knowledge/02 trap 1,
//    nine incidents).
//
// ============================== WHAT IS NOT PORTED ===========================
//
// Every unported path is a LOUD NAMED THROW carrying the ROM address it would
// have reached, never a silent no-op:
//
//   $A37A/$A466/$A46F/$A4A6  the `cmd >= $F0` inline-record spawners. Measured
//                            `total.raw5 = 0` over every run ever made here,
//                            and 0 executions of all four addresses over
//                            27,400 cartridge frames of seven long, varied
//                            scripts (wave 12, tools/oracle/throwaudit.py).
//                            Stage 1's four wave lists carry no cmd >= $F0 at
//                            all, so reaching them needs another stage.
//   23 of the 42 entries     of the $AE1C table are still throws -- 18 distinct
//                            routines. The NINETEEN that are ported -- 0 and 31
//                            (the RTS), 1, 39 and 41 ($AEDD), 2, 3, 4, 5, 6, 8,
//                            17, 18, and WAVE 22's 7, 9, 12, 15, 16, 19 -- are
//                            SIXTEEN distinct routines, and they are every entry
//                            stage 1's wave script names before the boss page.
//                            None of the 23 that remain has been measured
//                            executing on stage 1: wave 12's exec hook over
//                            27,400 frames of seven scripts named exactly five
//                            reachable ones and all five are in this wave.
//                            docs/worklog/gradius/12-impl-spawn-and-throw-audit.md
//                            has the ranked table; 22-impl-six-routines.md has
//                            the first frame and slot-frame count each of the
//                            six was measured at inside `deep-powered`.
//   $C413                    the stage-advance arm ($3A != 0, $1B = $82).
//                            $3A measured 0 on all 27,400 of those frames.
//   $BBB7's $BBE5 arm        the `$17 >= 3` rank consumer. Unreachable once any
//                            wave has fired, because it is gated on `$5D == 0`
//                            -- and 0 executions even on the run that held
//                            $17 = 4 for 5690 frames, because $BBC1's BEQ
//                            jumps the whole ladder while $19 | $1A is 0.
//
// $A3B1 -- THE SINGLE-ENEMY SPAWN -- IS PORTED AS OF WAVE 12, and so are the
// two handlers it reaches on stage 1: $B026/$B098 (the aiming turret, types
// $11/$91 and $12/$92) and $B198 (the arcing type $06/$86). The note they used
// to carry was the same falsified sentence the bullets carried: "no measured
// run has exercised them" is a fact about the corpus, and the owner reached
// $A3B1 in thirty seconds of ordinary play (06-FINDING-scroll-coverage.md).
//
// SLOTS 22-31 -- THE ENEMY BULLETS -- ARE PORTED AS OF WAVE 11, and the note
// they used to carry ("no measured run has ever populated them") is deleted
// rather than softened, because it is the exact sentence that produced two
// crashes in ordinary play. What was true was that no run in OUR CORPUS had
// populated them; that is a fact about the sampling, and it was read back as a
// claim about the cartridge. See $BC44's header for the measurement that
// separates the two. The whole path is here now: $BC59 (allocate, and FAIL),
// $BCB5 (aim, through the $83B5 divide), $BDD5 (move), and on the collision
// side $C20A (they kill the ship), $C2FF (terrain eats them) and $BF75 (a shot
// destroys one). What is still NOT ported on this path:
//
//   $BC44's $1A/$19 arm      stages 2+ skip the player-position gate entirely.
//   $B3B6/$B4A2/$B3B9/...    the OTHER producers of a bullet -- two unported
//                            enemy handlers that call $BCB5 and $BDFA directly.
//                            Their existence is why $BDD5's animation arm is
//                            transcribed even though $BC8B makes it dead here.

import { u8, u16, ENEMY_BASE, ENEMY_SLOTS } from './state.js';
import { soundRequest } from './sound.js';
import { probeCollision } from './terrain.js';
import { addScore } from './score.js';

const hex2 = (v) => `$${v.toString(16).toUpperCase().padStart(2, '0')}`;
const hex4 = (v) => `$${v.toString(16).toUpperCase().padStart(4, '0')}`;

// ---------------------------------------------------------------- $A527 -----
/**
 * `$A527` -- clear one enemy slot. THE definition of what an object slot is:
 * twenty-one arrays at X = $A8 + $0C, plus two writes at Y = $A8.
 *
 * The two Y-indexed writes are the ones 00-recon-enemies.md 8 called "arrays
 * indexed by j": `STA $0496,Y` is $0480[22 + j] and `STA $0460,Y` is
 * $0460[j] -- the same two arrays at the bullet-slot and shot-slot indices.
 * See the long note in state.js; the addresses are what matters and they are
 * spelled out on each line.
 */
export function clearSlot(state, j) {
  const o = state.obj;
  o.s0480[22 + j] = 0;                 // $A52B STA $0496,Y  ($0480 + 22 + j)
  o.s0460[j] = 0;                      // $A52E STA $0460,Y
  const i = u8(j + ENEMY_BASE);        // $A531 CLC / LDA $A8 / ADC #$0C / TAX
  o.status[i] = 0;                     // $A539 STA $0100,X
  o.anim[i] = 0;                       // $A53C STA $0120,X
  o.timer[i] = 0;                      // $A53F STA $0140,X
  o.animFrame[i] = 0;                  // $A542 STA $0160,X
  o.attrMask[i] = 0;                   // $A545 STA $0180,X
  o.type[i] = 0;                       // $A548 STA $0300,X
  o.y[i] = 0;                          // $A54B STA $0320,X
  o.yf[i] = 0;                         // $A54E STA $0340,X
  o.x[i] = 0;                          // $A551 STA $0360,X
  o.xf[i] = 0;                         // $A554 STA $0380,X
  o.carrier[i] = 0;                    // $A557 STA $03A0,X
  o.yvel[i] = 0;                       // $A55A STA $03B0,X
  o.yvelf[i] = 0;                      // $A55D STA $03E0,X
  o.style[i] = 0;                      // $A560 STA $0400,X
  o.xvel[i] = 0;                       // $A563 STA $0420,X
  o.xvelf[i] = 0;                      // $A566 STA $0440,X
  o.s0460[i] = 0;                      // $A569 STA $0460,X   <- index j+12, NOT j
  o.s0480[i] = 0;                      // $A56C STA $0480,X
  o.s04A0[i] = 0;                      // $A56F STA $04A0,X
  o.s04C0[i] = 0;                      // $A572 STA $04C0,X
  o.s04E0[i] = 0;                      // $A575 STA $04E0,X
}

/**
 * `$AEF8` -- the SHORT free, used by the movers and the off-screen box. It
 * clears five bytes, not twenty-three: a freed slot keeps its position and its
 * velocities until the next $A527 overwrites them. That difference is
 * observable, so it is not folded into clearSlot().
 *
 * EXPORTED SINCE WAVE 7 because `$C1FD` is `TYA / TAX / JMP $AEF8` -- the
 * collision arm's "destroy this object" is this routine reached with the enemy
 * index moved from Y to X, and both the capsule pickup ($C1AF) and the
 * every-16th item ($C18C) go through it. It is a JMP, not a JSR: $C1FD's caller
 * gets $AEF8's RTS.
 */
export function freeSlot(state, j) {
  const o = state.obj;
  const i = j + ENEMY_BASE;
  o.type[i] = 0;                       // $AEFA STA $030C,X
  o.status[i] = 0;                     // $AEFD STA $010C,X
  o.anim[i] = 0;                       // $AF00 STA $012C,X
  o.timer[i] = 0;                      // $AF03 STA $014C,X
  o.animFrame[i] = 0;                  // $AF06 STA $016C,X
}

/**
 * `$BE93` -- KILL an enemy. Wave 6. The only caller in this port is `$C0A9`,
 * the shot sweep's hit resolver (src/collision.js); the cartridge also reaches
 * it from `$C1D0` (the shield destroying what it absorbed, wave 7) and `$C19E`.
 *
 *   BE93  B9 0C 03  LDA $030C,Y / 29 7F AND #$7F / AA TAX
 *   BE99  E0 22     CPX #$22 / B0 08 BCS $BEA5     types >= $22 are silent
 *   BE9D  BD 6E BE  LDA $BE6E,X / F0 03 BEQ $BEA5  ...and so is a 0 entry
 *   BEA2  20 1E EC  JSR $EC1E                      the death sound (src/sound.js)
 *   BEA5  B9 AC 03  LDA $03AC,Y / F0 10 BEQ $BEBA  not a squadron member
 *   BEAA  C9 01     CMP #$01 / F0 07 BEQ $BEB5     already a CARRIER: stay one
 *   BEAE  AA        TAX / A9 00 LDA #$00 / D6 48 DEC $48,X / D0 02 BNE $BEB7
 *   BEB5  A9 01     LDA #$01
 *   BEB7  99 AC 03  STA $03AC,Y
 *   BEBA  A2 01     LDX #$01
 *   BEBC  B9 0C 03  LDA $030C,Y / 29 1F AND #$1F
 *   BEC1  C9 1A     CMP #$1A / D0 02 BNE $BEC7 / A2 03 LDX #$03
 *   BEC7  C9 05     CMP #$05 / D0 02 BNE $BECD / A2 00 LDX #$00
 *   BECD  8A        TXA / 99 6C 01 STA $016C,Y     the EXPLOSION SCRIPT index
 *   BED1  A9 02     LDA #$02 / 99 0C 03 STA $030C,Y    type := 2 ($AE99)
 *   BED6  A9 03     LDA #$03 / 99 4C 01 STA $014C,Y    timer := 3
 *   BEDB  A9 00     LDA #$00
 *   BEDD  99 8C 01  STA $018C,Y / 99 0C 01 STA $010C,Y / 99 2C 01 STA $012C,Y
 *   BEE6  99 2C 04  STA $042C,Y                        the script cursor
 *
 * THE COUNTER `$0048,X` UNDERFLOWS AND THAT IS THE POINT. `$BEAE` DECs it and
 * branches on the RESULT: non-zero -> A is still 0, so the carrier byte is
 * CLEARED; zero -> `$BEB5 LDA #$01` and the enemy becomes the capsule carrier.
 * Nothing tests it for 0 first, so killing a member of a squadron whose counter
 * has already reached 0 takes it to 255 and the next 255 kills of that group id
 * drop nothing. `$A400` seeds it (only for squadrons of >= 4, and only at the
 * alternating id `$49` = 2 or 3), and it is a COMPARED field: w_0048-w_004B.
 *
 * The three explosion scripts are picked by `type AND $1F`, NOT by `AND $7F`:
 * $1A -> script 3, $05 -> script 0, everything else -> script 1. So an
 * INITIALISED fan ($85, AND $1F = 5) and an uninitialised one (5) pick the same
 * script, which is why the AND is $1F and not $7F.
 */
export function killEnemy(state, res, j) {
  const o = state.obj;
  const i = j + ENEMY_BASE;
  const type = o.type[i];                          // $BE93 LDA $030C,Y
  const t7 = type & 0x7F;                          // $BE96 AND #$7F
  if (t7 < 0x22) {                                 // $BE99 CPX #$22 / BCS
    const id = res.weaponTables.read(0xBE6E + t7); // $BE9D LDA $BE6E,X
    if (id !== 0) soundRequest(state, id);        // $BEA0 BEQ / $BEA2 JSR $EC1E
  }
  const carrier = o.carrier[i];                    // $BEA5 LDA $03AC,Y
  if (carrier !== 0) {                             // $BEA8 BEQ $BEBA
    if (carrier === 1) {                           // $BEAA CMP #$01 / BEQ $BEB5
      o.carrier[i] = 1;                            // $BEB5/$BEB7 -- unchanged
    } else {
      const n = u8(state.squad[carrier] - 1);      // $BEB1 DEC $48,X
      state.squad[carrier] = n;
      o.carrier[i] = n === 0 ? 1 : 0;              // $BEB3 BNE $BEB7 (A = 0)
    }
  }
  let script = 1;                                  // $BEBA LDX #$01
  const t5 = type & 0x1F;                          // $BEBC/$BEBF AND #$1F
  if (t5 === 0x1A) script = 3;                     // $BEC1/$BEC5
  if (t5 === 0x05) script = 0;                     // $BEC7/$BECB
  o.animFrame[i] = script;                         // $BECD/$BECE STA $016C,Y
  o.type[i] = 2;                                   // $BED1/$BED3 -- handler 2
  o.timer[i] = 3;                                  // $BED6/$BED8
  o.attrMask[i] = 0;                               // $BEDD STA $018C,Y
  o.status[i] = 0;                                 // $BEE0 STA $010C,Y
  o.anim[i] = 0;                                   // $BEE3 STA $012C,Y
  o.xvel[i] = 0;                                   // $BEE6 STA $042C,Y
}

/**
 * The free-slot search, in BOTH shapes the ROM has.
 *
 *   $A3B1 / $A415 / $A46F   `LDX #$09 / LDA $030C,X / BEQ ok / DEX / BPL`
 *   $A4A6                   `LDX #$09 / LDA $030C,X / BEQ ok / DEX / BNE`
 *
 * The second exits with X = 0 UNEXAMINED, so that spawner can never use slot
 * 12. Reproduced rather than normalised (00-recon-enemies.md 4). It has no live
 * caller today -- $A4A6 is a throw below -- and it is here, and unit-tested, so
 * that whoever ports $A4A6 does not quietly write `>= 0` and lose the quirk.
 *
 * @param {boolean} testsIndexZero  true for DEX/BPL, false for $A4A6's DEX/BNE
 * @returns {number} the enemy index 0..9, or -1 when the pool is full
 */
export function allocEnemySlot(state, testsIndexZero) {
  let x = 9;                                        // $A415 LDX #$09
  for (;;) {
    if (state.obj.type[x + ENEMY_BASE] === 0) return x;   // $A417 / $A41A BEQ
    x -= 1;                                              // $A41C DEX
    if (testsIndexZero) { if (x < 0) return -1; }        // $A41D BPL  (tests 9..0)
    else if (x === 0) return -1;                         // $A4AE BNE  (tests 9..1)
  }
}

/** `$8402` -- the house 16-bit add, used here only on the wave cursor $6A:$6B. */
function addCursor(sp, a) {
  const lo = sp.z6A + a;
  sp.z6A = u8(lo);                     // $8403 ADC $00,X / $8405 STA $00,X
  if (lo > 0xFF) sp.z6B = u8(sp.z6B + 1);   // $8407 BCC / $8409 INC $01,X
}

// ---------------------------------------------------------------- $A579 -----
/**
 * `$A579` -- unpack a squadron's style byte onto one member.
 *
 * The odd bit is "this one carries a power-up" ($03AC = 1), and it also turns
 * the palette-OR byte $018C to 3, which is how a carrier is drawn in a
 * different colour.
 */
function applyStyle(state, i, b) {
  const o = state.obj;
  o.s04E0[i] = b & 0xFE;               // $A57B AND #$FE / $A57D STA $04EC,X
  o.style[i] = b & 0xFE;               // $A580 STA $040C,X
  o.carrier[i] = b & 0x01;             // $A583 LDA $98 / AND #$01 / STA $03AC,X
  if (b & 0x01) o.attrMask[i] = 3;     // $A58A BEQ / $A58C LDA #$03 / STA $018C,X
}

// ======================= THE SPAWN ENGINE, $A2C0 ============================

/** `$A2D1` -- (re)load the wave cursor for the chunk the camera is in. */
function loadChunk(state, rom, stageIndex) {
  const sp = state.spawn;
  // $A2D1 LDA $19 / ASL / TAY / LDA $A7D0,Y -> $98:$99
  const table = rom.word(0xA7D0 + 2 * stageIndex);
  sp.z61 = state.cam.hi & 0x0E;        // $A2DF LDA $3F / AND #$0E / STA $61
  sp.z6A = rom.read(table + sp.z61);   // $A2E5 TAY / $A2E6 LDA ($98),Y
  sp.z6B = rom.read(table + sp.z61 + 1);  // $A2EA INY / $A2EB LDA ($98),Y
}

/**
 * `$A2C0` -- the enemy spawn engine, called from $9A64 BEFORE the player moves.
 *
 * `$60` is its own three-state machine, measured: 1 at game frame 309, 2 at
 * 310, and `$6A:$6B` = $A844 from 310 onward.
 */
export function spawnEngine(state, res) {
  const rom = res.enemyTables;
  const sp = state.spawn;
  if (state.build.gate !== 0) {        // $A2C0 LDA $3A / BEQ $A2C7
    throw new Error('$3A != 0: $A2C4 JMP $C413, the stage-advance arm, is not '
                  + 'ported (measured 0 on 700 of 700 frames of stage 1)');
  }
  if (sp.z60 === 0) return;            // $A2C7 LDX $60 / BNE / $A2CB RTS
  if (u8(sp.z60 - 1) !== 0) {          // $A2CC DEX / $A2CD BNE $A2F0
    runEngine(state, rom, res.stage.stage);
    return;
  }
  sp.z60 = u8(sp.z60 + 1);             // $A2CF INC $60 -- ONLY on this entry;
  loadChunk(state, rom, res.stage.stage);  //  the $A308 reload path skips it
}

/** `$A2F0` -- the running state. */
function runEngine(state, rom, stageIndex) {
  const sp = state.spawn;
  if (state.substate === 0x81) return;   // $A2F0 CMP #$81 / $A2F6 RTS
  if (state.substate === 0x82) {         // $A2F7 CMP #$82
    throw new Error('$1B = $82: $A2FB JMP $C413 is not ported');
  }
  if (sp.z69 !== 0) {                    // $A2FE LDA $69 / BNE $A32B
    if (sp.z6C !== 0) {                  // $A32B LDA $6C / BNE $A332
      sp.z6C = u8(sp.z6C - 1);           // $A332 DEC $6C
      return;
    }
    emitMember(state, rom);              // $A32F JMP $A411
    return;
  }
  // $A302 LDY $61 / INY / INY / CPY $3F / BEQ $A2D1 -- the 512-px crossing.
  // Note it lands on $A2D1, PAST the `INC $60`, so a reload does not change the
  // engine state. Measured live at scroll $0200, game frame 1339.
  if (u8(sp.z61 + 2) === state.cam.hi) { loadChunk(state, rom, stageIndex); return; }

  // $A30A: read this record's trigger byte and turn it into a 16-bit scroll.
  const ptr = sp.z6A | (sp.z6B << 8);
  const trig = rom.read(ptr);            // $A30C LDA ($6A),Y  (Y = 0)
  // $A310 LDA #$00 / ASL $98 / ROL A -- $98 := trigger*2 (8-bit), A := its carry
  const lo = u8(trig << 1);
  const hi = u8(((trig >> 7) & 1) + sp.z61);   // $A315 CLC / ADC $61 / STA $99
  if (state.cam.hi === hi) {             // $A31A LDA $3F / CMP $99 / $A31E BEQ
    if (state.cam.lo >= lo) fireWave(state, rom);   // $A324 LDA $3E / CMP $98 / BCS
    return;
  }
  if (state.cam.hi > hi) fireWave(state, rom);      // $A320 BCS $A335
  // $A322 BCC $A32A -- not yet
}

/**
 * `$A335` -- a wave record's trigger has been reached.
 *
 * A record is TWO BYTES, `[trigger, cmd]`, and it fires when the 16-bit scroll
 * `$3F:$3E` reaches `($61 << 8) + trigger*2`. Measured ten for ten on stage 0
 * chunk 0 (frames 378, 506, 634, 762, 890, 954, 1018, 1082, 1146, 1210) and
 * again on the chunk switch at $0200 / frame 1339.
 */
function fireWave(state, rom) {
  const sp = state.spawn;
  sp.z5D = u8(sp.z5D + 1);               // $A335 INC $5D
  // $A337 LDY #$00 / STY $9A / STY $9B / LDX #$00 -- the 16-bit table offset
  const ptr = sp.z6A | (sp.z6B << 8);
  if (rom.read(ptr) === 0xFF) return;    // $A33F/$A341/$A345 -- the terminator
  const cmd = rom.read(u16(ptr + 1));    // $A346 INY / $A347 LDA ($6A),Y -> $98
  if (cmd >= 0xF0) {                     // $A34B CMP #$F0 / BCS $A37A
    throw new Error(`wave cmd ${hex2(cmd)} >= $F0: the 5-byte inline record at `
                  + '$A37A and its two spawners ($A46F, $A4A6) are not ported '
                  + '(measured total.raw5 = 0 on every run made here)');
  }
  addCursor(sp, 2);                      // $A34F LDA #$02 / LDX #$6A / JSR $8402

  if (cmd < 0x80) {                      // $A356 LDA $98 / $A358 BMI $A36D
    // $A35A ASL / CLC / ADC $98 -- a 16-bit cmd*3, carry kept in $9B
    const off = cmd * 3;
    loadDescriptor(state, rom, 0, off);  // $A366 LDY #$00 / $A368 JSR $A397
    // $A36B BMI $A3B1 -- ALWAYS TAKEN (see the header): the N flag is $A3AE's
    // final DEY leaving Y = $FF, not a test of $64.
    singleSpawn(state, rom);
    return;
  }
  // $A36D LDA $98 / ASL / ASL -- (cmd*4) AND $FF, so cmd AND $3F selects one of
  // 64 slots in a table that only has 24 records ($A602-$A661).
  loadDescriptor(state, rom, 2, u8(cmd << 2));   // $A373 LDY #$02 / JSR $A397
  // $A378 BMI $A3E4 -- ALWAYS TAKEN, same reason.
  formationSetup(state, rom);
}

/**
 * `$A397` -- copy four descriptor bytes into `$64-$67`.
 *
 * `$A5FE + Y` is a pointer PAIR: Y = 0 gives table A ($A662, single spawns),
 * Y = 2 gives table B ($A602, formations).
 */
function loadDescriptor(state, rom, y, off) {
  const sp = state.spawn;
  const base = rom.word(0xA5FE + y);              // $A397 / $A39F
  const a = u16(base + off);
  // $A3A6 LDY #$03 / LDA ($9A),Y / STA $0064,Y / DEY / BPL -- and it is that
  // final DEY, leaving Y = $FF, that sets N for the caller's BMI.
  sp.z67 = rom.read(u16(a + 3));
  sp.z66 = rom.read(u16(a + 2));
  sp.z65 = rom.read(u16(a + 1));
  sp.z64 = rom.read(a);
}

/**
 * `$A3B1` -- THE SINGLE-ENEMY SPAWN: the whole of a `cmd < $80` wave record.
 *
 * ONE enemy, no squadron, no `$69`/`$6C` emitter, no pattern table. The four
 * descriptor bytes come from table A ($A662, three bytes per command -- $A35A's
 * `ASL / CLC / ADC $98` is cmd*3, not cmd*4) and they mean DIFFERENT things
 * from the formation path's: here `$64` becomes the TYPE (after the two
 * subtractions below), `$65` is the style byte and `$66` is the Y. Nothing
 * writes `$010C`, so a single-spawn enemy has status 0 and $ADE8's animator
 * skips it entirely -- its handler owns its metasprite.
 *
 * `$64` CARRIES TWO THINGS IN ONE BYTE, and this is the only interesting line:
 *
 *   A3C3  LDY #$F0            assume the RIGHT edge
 *   A3C5  LDA $64 / SEC / SBC #$A0
 *   A3CA  CMP #$30 / BCC $A3D2
 *   A3CE  LDY #$10            ...otherwise the LEFT edge
 *   A3D0  SBC #$30            (carry is the CMP's, so this is a plain subtract)
 *
 * so `$64 - $A0` under $30 is a type spawning at X = $F0 and marching left, and
 * `$64 - $D0` is a type spawning at X = $10. Stage 1 only ever uses the first
 * arm: its three table-A entries are $B2 $80 $12 (cmd $00 -> type $12), $A6 $81
 * $B7 (cmd $01 -> type $06) and $A6 $80 $B7 (cmd $02 -> type $06).
 *
 * WHY THIS IS HERE NOW. It was excluded from the eight-wave plan on the
 * reasoning "no measured run has exercised it", and THE OWNER CRASHED INTO IT
 * IN ORDINARY PLAY (06-FINDING-scroll-coverage.md) -- thirty seconds of
 * scrolling. The exclusion was a fact about the CORPUS read back as a claim
 * about the cartridge. The boundary the old throw carried was right and is kept
 * here as a measurement: stage 1 chunks $61 = 0 and $61 = 2 are all cmd >= $80
 * until the record at $A859 + $18 -- trigger $C0, i.e. scroll $0380 -- which is
 * cmd $00. Then $C8 ($0390) and $D0 ($03A0) are cmd $00 again, $E0 ($03C0) is
 * cmd $01 and $F0 ($03E0) is cmd $02.
 *
 * The allocator is the DEX/BPL shape, so unlike $A4A6 it does test slot 12, and
 * like every other allocator here it scans DOWNWARD from index 9. Allocation
 * failure ($A3BB, a bare RTS) DROPS the spawn: no retry, no queue, and the wave
 * cursor has already advanced at $A34F, so that record is simply lost.
 */
function singleSpawn(state, rom) {
  const sp = state.spawn;
  const o = state.obj;
  const j = allocEnemySlot(state, true);   // $A3B1 LDX #$09 / $A3B3 LDA $030C,X
  if (j < 0) return;                       // $A3BB RTS -- the spawn is DROPPED
  sp.zA8 = j;                              // $A3BC STX $A8
  clearSlot(state, j);                     // $A3BE JSR $A527
  const i = j + ENEMY_BASE;                // $A3C1 LDX $A8
  let x = 0xF0;                            // $A3C3 LDY #$F0
  let t = u8(sp.z64 - 0xA0);               // $A3C5 LDA $64 / SEC / SBC #$A0
  if (t >= 0x30) {                         // $A3CA CMP #$30 / $A3CC BCC $A3D2
    x = 0x10;                              // $A3CE LDY #$10
    t = u8(t - 0x30);                      // $A3D0 SBC #$30
  }
  o.type[i] = t;                           // $A3D2 STA $030C,X
  o.x[i] = x;                              // $A3D5 TYA / STA $036C,X
  applyStyle(state, i, sp.z65);            // $A3D9 LDA $65 / $A3DB JSR $A579
  o.y[i] = sp.z66;                         // $A3DE LDA $66 / STA $032C,X
}                                          // $A3E3 RTS

/**
 * `$A3E4` -- set a squadron up, then FALL THROUGH into $A411 to emit its first
 * member on the same frame.
 *
 * `$66` indexes the 2-byte formation table at $A592: low nibble = member count,
 * high nibble = spawn X, second byte = the first member's Y. `$67` indexes the
 * 3-byte pattern table at $A5BC: [delay, dY, style].
 *
 * Measured for cmd $80 (formation 0, pattern 0): four members at X $F0, Y $2A,
 * appearing on frames 378, 389, 400 and 411 -- delay+1 = 11 frames apart.
 */
function formationSetup(state, rom) {
  const sp = state.spawn;
  const x = u8(sp.z66 << 1);             // $A3E4 LDA $66 / ASL / TAX (8-bit!)
  const b0 = rom.read(0xA592 + x);       // $A3E8 LDA $A592,X
  sp.z69 = b0 & 0x0F;                    // $A3EB AND #$0F / STA $69
  sp.z6F = b0 & 0x0F;                    // $A3EF STA $6F
  if ((b0 & 0x0F) >= 4) {                // $A3F1 CMP #$04 / BCC $A405
    // $A3F5: the group id alternates 2/3 per squadron, and the squadron's
    // member count is seeded at $0048+id -- the counter killEnemy() ($BE93,
    // wave 6, above) decrements on each kill, which turns the LAST member into
    // a capsule carrier and which UNDERFLOWS to 255 when it is already 0.
    state.zp49 = u8((u8(state.zp49 + 1) & 0x01) | 0x02);   // INC / AND / ORA
    state.squad[state.zp49] = sp.z69;    // $A400 LDA $69 / STA $0048,Y
  }
  sp.z6D = rom.read(0xA592 + x) & 0xF0;  // $A405 LDA $A592,X / AND #$F0 / STA $6D
  sp.z6E = rom.read(0xA593 + x);         // $A40C LDA $A593,X / STA $6E
  emitMember(state, rom);                // falls through into $A411
}

/**
 * `$A411` -- emit one squadron member, or drop it.
 *
 * `$69` is decremented FIRST and unconditionally, and `$6C` is reloaded at
 * $A42F, i.e. only after a successful allocation. That is the whole of the
 * measured failure behaviour: no retry, no queue, and the squadron's spacing
 * collapses to one frame per member.
 */
function emitMember(state, rom) {
  const sp = state.spawn;
  const o = state.obj;
  sp.z69 = u8(sp.z69 - 1);               // $A411 DEC $69
  if (sp.z69 & 0x80) return;             // $A413 BMI $A41F (RTS)
  const j = allocEnemySlot(state, true); // $A415 LDX #$09 ... DEX / BPL
  if (j < 0) return;                     // $A41F RTS -- the member is DROPPED
  sp.zA8 = j;                            // $A420 STX $A8
  clearSlot(state, j);                   // $A422 JSR $A527
  const i = j + ENEMY_BASE;              // $A425 LDX $A8
  // $A427 LDA $67 / ASL / ASL / SEC / SBC $67 -- $67 * 3, all 8-bit
  const y = u8(u8(sp.z67 << 2) - sp.z67);
  sp.z6C = rom.read(0xA5BC + y);         // $A42F LDA $A5BC,Y / STA $6C
  // $A434 LDA $A5BD,Y / CLC / ADC $6E -- the running Y, so members stack
  sp.z6E = u8(rom.read(0xA5BD + y) + sp.z6E);
  o.y[i] = sp.z6E;                       // $A43C STA $032C,X
  o.x[i] = sp.z6D;                       // $A43F LDA $6D / STA $036C,X
  applyStyle(state, i, rom.read(0xA5BE + y));   // $A444 / $A447 JSR $A579
  // $A44A LDA $65 / CMP #$0B / BEQ $A45B -- type $0B never carries a capsule
  if (sp.z65 !== 0x0B) {
    // $A450 LDA $6F / CMP #$04 / BCC $A45B -- and neither does a squadron of
    // fewer than four, because it has no counter at $0048+$49.
    if (sp.z6F >= 4) o.carrier[i] = state.zp49;   // $A456 LDA $49 / STA $03AC,X
  }
  o.status[i] = sp.z64;                  // $A45B LDA $64 / STA $010C,X
  o.type[i] = sp.z65;                    // $A460 LDA $65 / STA $030C,X
}

// ================== THE ENEMY-BULLET ENGINE, $BBB7 ($9A67) ==================

/**
 * `$BBB7` -- called from $9A67, between the spawn engine and the player.
 *
 * `$5D` LOOKS like a free-running wave counter and is NOT: `$9656 STA $5D`
 * clears it at the top of every single mode-5 frame, so it reads non-zero here
 * only on a frame `$A335` has just fired a wave on. That is the difference
 * between "this arm is unreachable" and "this arm runs on 99% of frames", and
 * getting it backwards would have left `$040C,X` frozen on every enemy.
 *
 * The normal arm is a COUNTDOWN TO A SHOT. For each enemy of type AND $7F >= 3
 * it subtracts $98 from `$040C,X`; on borrow it reloads `$040C,X` from
 * `$04EC,X`, calls `$BC44` (fire) and LEAVES THE LOOP -- so at most one enemy
 * shoots per frame. On stage 1 $98 is 1 (`$BBBD LDA $19 / ORA $1A / BEQ
 * $BBEC` with Y still 1) and `$04EC,X` is the squadron's style byte AND $FE,
 * which is $C8 = 200 for every stage-1 squadron.
 *
 * A FIRST GUESS THAT WAS WRONG, WRITTEN DOWN BECAUSE IT IS THE INTERESTING
 * PART: this said "no stage-1 enemy lives 200 frames, which is why no measured
 * run ever populated slots 22-31", and the very first 1465-frame comparison
 * threw at slot 17 on the countdown. Type $88 marches left one pixel a frame
 * from X = $F0 and is only freed below X = 4, so it lives 236 frames and DOES
 * reach the shot. What actually keeps the bullet slots empty is `$BC44`'s own
 * stage-0/1 gate: an enemy fires only when the PLAYER IS TO ITS LEFT, and the
 * `enemy-waves` scenario parks the ship at X = 240 against the right wall.
 *
 * WAVE 11 CLOSED THE OTHER HALF OF THAT SENTENCE. It is not just that
 * `enemy-waves` parks the ship on the right -- NO fixed hold can be in the
 * right place at the right time. The countdown is 200 frames for every stage-1
 * squadron, so a firing enemy is always at X = 33..38, and the ship has to be
 * further left than that at exactly that frame; stage 1's opening kills every
 * hold that tries (first death: idle 1051, L 1083, LD 1098, LU 1108, and four
 * scripted dashes at f1149/1734/1742/1800). The four `enemy-bullet*` scenarios
 * poke `$040C,X` instead. See $BC44 below.
 */
export function enemyBullets(state, res) {
  const o = state.obj;
  if (state.spawn.z5D !== 0) return bulletUpdate(state, res);   // $BBB7 BNE $BC19
  // $BBBB LDY #$01, and on stage 1 nothing touches Y again before $BBEC.
  // $BBBD LDA $19 / ORA $1A / BEQ $BBEC -- on stage 1 with $1A = 0 the whole
  // $02-parity / $1A / $46 / $17 ladder at $BBC3-$BBEB is jumped over and $98
  // stays 1. The other arms are not ported, and since wave 7 that is a stage
  // gate rather than a missing byte: $46 and $17 are both live now, and
  // `capsule-sweep` drives $17 to 4 with a shield up -- $BBE5 still ran ZERO
  // times, because $BBC1's BEQ jumps the whole ladder while $19 | $1A is 0.
  // Measured this wave; it is the plan's risk 5, answered NO for stage 1.
  if (res.stage.stage !== 0 || state.zp1A !== 0) {
    throw new Error(`$19 = ${res.stage.stage}, $1A = ${hex2(state.zp1A)}: `
                  + '$BBC3-$BBEB (the $02 parity, the $1A arms and the $17 >= 3 '
                  + 'rank bump that decide how fast $040C,X counts down) is not '
                  + 'ported -- stage 1 branches past all of it at $BBC1');
  }
  const sub = 1;                         // $BBEC STY $98, with Y still 1
  for (let x = 9; x >= 0; x--) {         // $BBEE LDX #$09 / $BC15 DEC $A8 / BPL
    state.spawn.zA8 = x;                 // $BBF0 STX $A8
    const i = x + ENEMY_BASE;
    // $BBF4 LDA $030C,X / AND #$7F / CMP #$03 / BCC $BC15 -- free slots (0),
    // capsules (1) and explosions (2) do not count down.
    if ((o.type[i] & 0x7F) < 3) continue;
    // $BBFD LDA $040C,X / SBC $98 -- the CMP above left carry SET, so this is a
    // plain subtract, not a subtract-with-borrow.
    const v = o.style[i] - sub;
    if (v >= 0) { o.style[i] = v; continue; }      // $BC02 BCS $BC12 / STA
    if (o.s04E0[i] === 0) continue;                // $BC04 LDA $04EC,X / BEQ
    o.style[i] = o.s04E0[i];                       // $BC09 STA $040C,X
    fireBullet(state, res, x);                     // $BC0C JSR $BC44
    return bulletUpdate(state, res);                    // $BC0F JMP $BC19 -- and note
                                                   // it LEAVES the loop, fired
                                                   // or not: at most one enemy
                                                   // can reach $BC44 per frame
  }
  return bulletUpdate(state, res);            // the loop falls through into $BC19
}

/**
 * `$BC44` -- decide whether this enemy actually shoots.
 *
 * On stages 0 and 1 with `$1A` clear there is a gate nothing else in the game
 * has: `LDA $0360 / CMP $036C,X / BCC $BC59` -- fire ONLY IF THE PLAYER IS TO
 * THE LEFT of the enemy. An enemy the ship has already flown past does not
 * shoot backwards.
 *
 * WHY THE WHOLE PATH BELOW WAS EXCLUDED FOR EIGHT WAVES, AND WHY THAT WAS
 * WRONG. The plan said "no measured run has exercised them"; that was a fact
 * about the CORPUS, and it got read back as a claim about the cartridge. The
 * owner falsified it in seconds of ordinary play -- fly left of an enemy --
 * and the port froze (05-FINDING-enemy-bullets-reached-in-play.md).
 *
 * MEASURED THIS WAVE with tools/oracle/bulletprobe.py, because the corpus's own
 * geometry is the reason it never saw this:
 *   * over 1900 frames of `enemy-waves`'s own script, `$BC44` is entered SEVEN
 *     times (f1158 1223 1285 1354 1734 1799 1862) and takes `$BC58 RTS` all
 *     seven, because that scenario parks the ship at X = 240;
 *   * every one of those seven is type $88 with the enemy at X = 33..38 -- the
 *     countdown is 200 frames ($04EC = style AND $FE, and EVERY stage-1
 *     squadron's style is $C8/$C9, read out of $A5BC via the descriptors), so
 *     an enemy only reaches the shot after marching 200 px left of its $F0
 *     spawn. The ship has to be at X < ~33 at that instant;
 *   * and it cannot be: first death per hold, from frame 210, is idle 1051,
 *     L 1083, LD 1098, LU 1108. Stage 1's opening kills anything on the left
 *     half of the screen long before frame 1158. Five scripted attempts to dart
 *     left in time (with and without `$40 = 6`) died at f1149, f1734, f1742,
 *     f1800 -- measured, not assumed.
 * So the corpus reaches `$BC44` naturally and can never reach `$BC59` naturally.
 * The scenarios poke `$040C,X`, the countdown itself -- see POKEABLE_RANGES in
 * tools/oracle/porttrace.mjs for why that is a cartridge value and not an
 * invented one.
 */
function fireBullet(state, res, j) {
  if (state.zp1A !== 0 || res.stage.stage >= 2) {  // $BC44 / $BC48 CMP #$02
    throw new Error(`$1A = ${hex2(state.zp1A)}, $19 = ${res.stage.stage}: `
                  + '$BC44 skips the player-position gate on stages 2+ and '
                  + 'goes straight to the bullet allocator at $BC59. The GATE '
                  + 'is what is unported here, not the allocator');
  }
  // $BC4E LDX $A8 / $BC50 LDA $0360 / CMP $036C,X / $BC56 BCC $BC59
  if (state.obj.x[0] >= state.obj.x[j + ENEMY_BASE]) return;   // $BC58 RTS
  allocBullet(state, res, j);                                  // $BC59
}

/**
 * `$BC59-$BCAE` -- allocate a bullet slot and fill it in, then FALL THROUGH.
 *
 *   BC59  A2 09     LDX #$09
 *   BC5B  BD 36 01  LDA $0136,X / F0 08 BEQ $BC68 / CA DEX / 10 F8 BPL $BC5B
 *   BC63  60        RTS                       <-- ALLOCATION FAILURE
 *   BC68  86 A9     STX $A9                   the bullet slot, 0..9
 *   BC6A  A6 A8     LDX $A8 / A0 00 LDY #$00
 *   BC6E  BD 0C 01  LDA $010C,X / 10 05 BPL $BC78 / C9 90 CMP #$90 / B0 01 BCS
 *   BC77  C8        INY                       the firing ENEMY's status picks
 *                                             the bullet KIND
 *   BC78  A6 A9     LDX $A9
 *   BC7A  B9 64 BC  LDA $BC64,Y / 9D 36 01 STA $0136,X    metasprite
 *   BC80  B9 66 BC  LDA $BC66,Y / 9D 16 03 STA $0316,X / 9D 76 01 STA $0176,X
 *   BC89  A9 00     LDA #$00 / 9D 16 01 STA $0116,X
 *   BC8E  A4 A8     LDY $A8 / BE 96 04 LDX $0496,Y        the MUZZLE index
 *   BC93  BD 32 BC  LDA $BC32,X / 85 98 STA $98           its dx
 *   BC98  BD 3B BC  LDA $BC3B,X / 85 99 STA $99           its dy
 *   BC9D  A6 A9     LDX $A9
 *   BC9F  B9 2C 03  LDA $032C,Y / 18 / 65 99 ADC $99 / 9D 36 03 STA $0336,X
 *   BCA8  B9 6C 03  LDA $036C,Y / 18 / 65 98 ADC $98 / 9D 76 03 STA $0376,X
 *   BCB1  8A        TXA / 18 CLC / 69 0A ADC #$0A         <-- FALLS INTO $BCB5
 *
 * FOUR THINGS THIS GETS RIGHT ON PURPOSE.
 *
 * 1. **ALLOCATION FAILURE IS GAMEPLAY.** `$BC63` is a bare RTS: the shot is
 *    simply not fired, `$040C,X` has ALREADY been reloaded from `$04EC,X` at
 *    `$BC09` (before the JSR), and nothing is retried. The enemy waits another
 *    200 frames. MEASURED on the cartridge: with ten enemies made to fire on
 *    consecutive frames, `$BC59` ran 14 times, `$BC68` 10, and **`$BC63` 4** --
 *    at f501, f507, f511 and f516 -- and the ten bullets carried on unchanged.
 * 2. **THE ALLOCATOR SCANS DOWNWARD**, from index 9, exactly like the four
 *    enemy allocators. MEASURED slot order: 9,8,7,6,5,4,3,2,1,0, i.e. object
 *    slot 31 fills first, which is what decides sprite priority at $8B47.
 * 3. **$0496,Y IS THE j-INDEXED ARRAY**, `s0480[22 + j]`, not `s0480[j + 12]`.
 *    That is the same pair of bytes $A527 distinguishes (see clearSlot above).
 *    MEASURED 0 for every stage-1 squadron, so the muzzle offset is entry 0 =
 *    (0,0) and the bullet starts on the enemy's own pixel.
 * 4. **$BCB1 IS A FALL-THROUGH INTO $BCB5**, not a call to it (docs/knowledge/02
 *    trap 1, nine incidents). And the `ADC #$0A` is the whole reason the aim
 *    routine and the mover address the bullet as `$010C,X` with X = $0A + slot:
 *    $010C + $0A + slot IS $0116 + slot.
 */
function allocBullet(state, res, j) {
  const o = state.obj;
  const rom = res.enemyTables;
  let k = -1;
  for (let x = 9; x >= 0; x--) {         // $BC59 LDX #$09 / $BC60 DEX / BPL
    if (o.anim[22 + x] === 0) { k = x; break; }   // $BC5B LDA $0136,X / BEQ $BC68
  }
  if (k < 0) {                           // $BC63 RTS -- every slot busy
    state.work.bulletAllocFail += 1;     // counted so the failure is VISIBLE
    return;
  }
  state.spawn.zA9 = k;                   // $BC68 STX $A9
  const e = j + ENEMY_BASE;              // $BC6A LDX $A8
  const st = o.status[e];                // $BC6E LDA $010C,X
  // $BC71 BPL $BC78 / $BC73 CMP #$90 / $BC75 BCS $BC78 / $BC77 INY -- kind 1
  // only for a status in $80-$8F. MEASURED n=0: no stage-1 enemy has one.
  const y = (st & 0x80) !== 0 && st < 0x90 ? 1 : 0;
  const i = 22 + k;                      // $BC78 LDX $A9
  o.anim[i] = rom.read(0xBC64 + y);      // $BC7A/$BC7D STA $0136,X
  const kind = rom.read(0xBC66 + y);     // $BC80 LDA $BC66,Y
  o.type[i] = kind;                      // $BC83 STA $0316,X
  o.animFrame[i] = kind;                 // $BC86 STA $0176,X -- the SAME byte, and
                                         //   it is the bullet's box class at $C22F
  o.status[i] = 0;                       // $BC89/$BC8B STA $0116,X
  const m = o.s0480[22 + j];             // $BC8E LDY $A8 / $BC90 LDX $0496,Y
  const mdx = rom.read(0xBC32 + m);      // $BC93 LDA $BC32,X / STA $98
  const mdy = rom.read(0xBC3B + m);      // $BC98 LDA $BC3B,X / STA $99
  o.y[i] = u8(o.y[e] + mdy);             // $BC9F-$BCA5
  o.x[i] = u8(o.x[e] + mdx);             // $BCA8-$BCAE
  aimBullet(state, u8(k + 0x0A));        // $BCB1 TXA / CLC / ADC #$0A -- FALL-THROUGH
}

/**
 * `$83B5` -- the cartridge's 24-by-8 restoring divide, transcribed literally.
 *
 *   83B5  E6 5D     INC $5D                <-- A SIDE EFFECT, and it is watched
 *   83B7  86 98 / 84 99 / A9 00 / 85 9A    $98:$99:$9A := X:Y:00
 *   83BF  A5 9B / 10 08                    divisor >= $80 -> halve BOTH
 *   83C3  46 98 / 66 99 / 66 9A / 46 9B
 *   83CB  A9 00 / A2 11 / 18               A = 0, 17 iterations, carry clear
 *   83D0  26 9A / 26 99 / 26 98            ROL the 24-bit register
 *   83D6  CA / F0 09                       DEX / BEQ $83E2 -- so only SIXTEEN
 *                                          quotient bits are produced
 *   83D9  2A        ROL A                  bring the shifted-out bit down...
 *   83DA  C5 9B     CMP $9B                ...and OVERWRITE the carry it made.
 *                                          A ROL A that overflows loses its top
 *                                          bit here; that is the ROM's own
 *                                          8-bit limit, not a transcription slip
 *   83DC  90 F2     BCC $83D0              quotient bit 0
 *   83DE  E5 9B / B0 EE  SBC $9B / BCS     quotient bit 1 (always taken)
 *
 * The caller uses `$99:$9A` as an 8.8 fraction, so the result is
 * min/max * 256. VALIDATED against the cartridge on the ten (min,max) pairs
 * bulletprobe.py recorded at `$BD1C`/`$BD1F` -- (16,53)->77, (18,45)->102,
 * (23,35)->168, (25,28)->228, (33,33)->116, (38,38)->33, (45,45)->11,
 * (60,60)->8, (75,75)->6, (90,90)->5 -- all ten exact, `$98` and `$99` zero on
 * every one. tests/enemies.test.js replays them.
 *
 * `INC $5D` IS NOT DECORATION. `$5D` is the byte `$BBB7` gates on and it is a
 * watched address (w_005D); `$9656 STA $5D` clears it at the top of every
 * mode-5 frame, so a divide performed here leaves `$5D = 1` at the $80B5 sample
 * point. A port that skipped it would diverge on w_005D on every firing frame.
 *
 * @returns {{hi:number, mid:number, lo:number}} $98, $99, $9A
 */
export function divide83B5(state, x, y, divisor) {
  state.spawn.z5D = u8(state.spawn.z5D + 1);   // $83B5 INC $5D
  let m98 = x, m99 = y, m9A = 0;               // $83B7-$83BD
  let d = divisor;                             // $9B
  if (d & 0x80) {                              // $83BF LDA $9B / BPL $83CB
    const c98 = m98 & 1; m98 >>= 1;            // $83C3 LSR $98
    const c99 = m99 & 1; m99 = (m99 >> 1) | (c98 << 7);   // $83C5 ROR $99
    m9A = (m9A >> 1) | (c99 << 7);             // $83C7 ROR $9A
    d >>= 1;                                   // $83C9 LSR $9B
  }
  let a = 0;                                   // $83CB LDA #$00
  let carry = 0;                               // $83CF CLC
  for (let n = 0x11; ;) {                      // $83CD LDX #$11
    let t = (m9A << 1) | carry; m9A = t & 0xFF; let c = t >> 8;   // $83D0 ROL $9A
    t = (m99 << 1) | c;         m99 = t & 0xFF; c = t >> 8;       // $83D2 ROL $99
    t = (m98 << 1) | c;         m98 = t & 0xFF; c = t >> 8;       // $83D4 ROL $98
    n -= 1;                                    // $83D6 DEX
    if (n === 0) break;                        // $83D7 BEQ $83E2
    a = u8((a << 1) | c);                      // $83D9 ROL A -- its carry-out is
                                               //   discarded by the CMP below
    if (a < d) { carry = 0; continue; }        // $83DA CMP $9B / $83DC BCC $83D0
    a = u8(a - d);                             // $83DE SBC $9B (carry was SET)
    carry = 1;                                 // $83E0 BCS $83D0 -- always taken
  }
  return { hi: m98, mid: m99, lo: m9A };       // $83E2 RTS
}

/**
 * `$BCB5-$BDD1` -- point the new bullet at the ship.
 *
 * Entered by FALL-THROUGH from `$BCB1` with A = bullet slot + $0A, and also
 * called directly from `$B3B6`/`$B4A2` (two unported enemy handlers).
 *
 *   BCB5  85 A9 / AA               $A9 := slot + $0A, and X with it
 *   BCB8  A5 17 / C9 03 / 90 1A    rank < 3 -> $BCD8, aim AT the ship
 *   BCBE  AD 20 03 / 85 98         rank >= 3: target Y = the ship's
 *   BCC3  A5 02 / 0A               <-- DEAD: the value is dropped and the carry
 *                                      it sets is overwritten two lines later
 *   BCC6  A5 02 / 4A / 4A / 29 1F  lead = ($02 >> 2) AND $1F ...
 *   BCCC  6D 60 03                 ...ADC $0360 -- and the carry it adds is BIT
 *                                      1 OF $02, left by the SECOND LSR
 *   BCCF  90 02 / A9 F8            target X saturates at $F8
 *   BCD8  AD 20 03 / AD 60 03      rank < 3: the ship's own X and Y
 *   BCE2  A0 00                    $A0 collects the direction bits
 *   BCE4  BD 2C 03 / 38 / E5 98    dy = bulletY - targetY
 *   BCEA  B0 03 / C8 / 49 FF       borrow -> bit 0 SET and one's-complement
 *   BCEF  D0 02 / A9 01            a zero component becomes 1
 *   BCF5  BD 6C 03 / 38 / E5 99    dx, the same, into bits 1 (INY twice)
 *   BD05  84 A0 / A0 00 / A6 9C / 85 9D
 *   BD0D  C5 9C / B0 05            |dx| >= |dy| ? A = max, X = min, Y = 0
 *   BD11  A5 9C / A6 9D / C8       : A = |dy|, X = |dx|, Y = 1 (STEEP)
 *   BD16  85 9B / 84 A1 / A0 00 / 20 B5 83    divide min by max
 *   BD1F  A6 A9 / A5 A0 / 9D 6C 04            $046C,X := the direction bits
 *   BD26  A5 A1 / D0 54                       steep -> $BD7E
 *
 * THE DIRECTION BYTE IS TWO INDEPENDENT BITS AND THE MOVER READS THEM TWO
 * DIFFERENT WAYS: `$BDFD CMP #$02 / BCC` tests bit 1 (X sign) and `$BE35
 * AND #$01` tests bit 0 (Y sign). Bit 0 set = the target was BELOW the bullet.
 *
 * THE TWO SPEED BUMPS ARE NOT THE SAME SHAPE, and this is the trap in the
 * routine. Both halve `$99:$9A` with `LSR/ROR` and then add it back in, but:
 *   * the `$1A` bump ($BD42) is entered through `LDA $1A / BEQ`, neither of
 *     which touches the carry -- so `$BD48 ADC` carries in THE BIT THE ROR JUST
 *     SHIFTED OUT;
 *   * the `$17` bump ($BD5F) is entered through `CMP #$02`, which OVERWRITES
 *     that carry with "rank >= 2" -- and the arm only runs when that is true,
 *     so `$BD67 ADC` always carries in ONE.
 * A port that used the same helper for both is wrong on the second one.
 *
 * MEASURED: `$BD28` (the shallow arm) 10 of 13 fires, `$BD7E` (steep) 3;
 * `$BCD8` 10, `$BCBE` 0 -- the rank-3 lead is listing-only in the natural
 * corpus, and `enemy-bullet-rank` reaches it by poking $45/$46 to values
 * $8974 itself writes, which puts $17 at 3 through $9C45.
 */
function aimBullet(state, a9) {
  const o = state.obj;
  state.spawn.zA9 = a9;                  // $BCB5 STA $A9 / $BCB7 TAX
  const i = u8(a9 + ENEMY_BASE);         // every array below is base + $0C + X
  let ty, tx;
  if (state.zp17 >= 3) {                 // $BCB8 LDA $17 / CMP #$03 / BCC $BCD8
    ty = o.y[0];                         // $BCBE LDA $0320 / STA $98
    // $BCC3 LDA $02 / $BCC5 ASL A: DEAD CODE. The accumulator is reloaded on
    // the very next instruction and the carry the ASL sets is overwritten by
    // the two LSRs. Kept as a comment, not as a line, and named as dead so
    // nobody re-derives it as "bit 7 of $02 is the carry" -- it is bit 1.
    const lead = (state.frame >> 2) & 0x1F;      // $BCC6-$BCCA LSR/LSR/AND #$1F
    const carryIn = (state.frame >> 1) & 1;      // the SECOND LSR's carry-out
    const sum = lead + o.x[0] + carryIn;         // $BCCC ADC $0360
    tx = sum > 0xFF ? 0xF8 : sum;                // $BCCF BCC / $BCD1 LDA #$F8
  } else {
    ty = o.y[0];                         // $BCD8 LDA $0320 / STA $98
    tx = o.x[0];                         // $BCDD LDA $0360 / STA $99
  }
  let dir = 0;                           // $BCE2 LDY #$00
  let dy = u8(o.y[i] - ty);              // $BCE4 LDA $032C,X / SEC / SBC $98
  if (o.y[i] < ty) { dir += 1; dy = u8(dy ^ 0xFF); }   // $BCEA BCS / INY / EOR #$FF
  if (dy === 0) dy = 1;                  // $BCEF BNE $BCF3 / $BCF1 LDA #$01
  let dx = u8(o.x[i] - tx);              // $BCF5 LDA $036C,X / SEC / SBC $99
  if (o.x[i] < tx) { dir += 2; dx = u8(dx ^ 0xFF); }   // $BCFB BCS / INY INY / EOR
  if (dx === 0) dx = 1;                  // $BD01 BNE $BD05 / $BD03 LDA #$01
  // $BD09 LDX $9C (|dy|) / $BD0B STA $9D (|dx|) / $BD0D CMP $9C
  const steep = dx < dy;                 // $BD0F BCS $BD16 -- else Y = 1
  const max = steep ? dy : dx;           // $BD16 STA $9B
  const min = steep ? dx : dy;           // X, the divide's dividend
  const q = divide83B5(state, min, 0, max);    // $BD1A LDY #$00 / $BD1C JSR $83B5
  o.s0460[i] = dir;                      // $BD1F LDX $A9 / $BD21 LDA $A0 / STA $046C,X
  // The two halves below are mirror images with the axes swapped; they are
  // written out twice because the ROM writes them out twice and the pair of
  // ADC carries differs between them (see the header).
  let hi = q.mid, lo = q.lo;             // $99:$9A, consumed destructively
  if (!steep) {                          // $BD26 LDA $A1 / $BD28 BNE $BD7E
    o.xvelf[i] = 0;                      // $BD2A LDA #$00 / $BD2C STA $044C,X
    o.xvel[i] = 1;                       // $BD2F LDA #$01 / $BD31 STA $042C,X
    o.yvelf[i] = lo;                     // $BD34 LDA $9A / $BD36 STA $03EC,X
    o.yvel[i] = hi;                      // $BD39 LDA $99 / $BD3B STA $03BC,X
    let c = lo & 1;                      // $BD3E LSR $99 / $BD40 ROR $9A
    lo = (lo >> 1) | ((hi & 1) << 7); hi >>= 1;
    if (state.zp1A !== 0) {              // $BD42 LDA $1A / $BD44 BEQ $BD5B
      let s = lo + o.yvelf[i] + c;       // $BD46 LDA $9A / ADC $03EC,X -- the ROR's
      o.yvelf[i] = u8(s);                //   carry, because BEQ did not touch it
      s = hi + o.yvel[i] + (s > 0xFF ? 1 : 0);   // $BD4E LDA $99 / ADC $03BC,X
      o.yvel[i] = u8(s);
      o.xvelf[i] = 0x80;                 // $BD56 LDA #$80 / $BD58 STA $044C,X
    }
    c = lo & 1;                          // $BD5B LSR $99 / $BD5D ROR $9A
    lo = (lo >> 1) | ((hi & 1) << 7); hi >>= 1;
    // $BD5F LDA $17 / CMP #$02 / BCC $BD7D -- and the CMP REPLACES `c` with 1
    // on the only path that reaches the adds.
    if (state.zp17 >= 2) {
      let s = lo + o.yvelf[i] + 1;       // $BD65 LDA $9A / ADC $03EC,X, carry SET
      o.yvelf[i] = u8(s);
      s = hi + o.yvel[i] + (s > 0xFF ? 1 : 0);   // $BD6D LDA $99 / ADC $03BC,X
      o.yvel[i] = u8(s);
      s = o.xvelf[i] + 0x40 + (s > 0xFF ? 1 : 0);// $BD75 LDA $044C,X / ADC #$40
      o.xvelf[i] = u8(s);
    }
    return;                              // $BD7D RTS
  }
  o.yvel[i] = 1;                         // $BD7E LDA #$01 / $BD80 STA $03BC,X
  o.yvelf[i] = 0;                        // $BD83 LDA #$00 / $BD85 STA $03EC,X
  o.xvelf[i] = lo;                       // $BD88 LDA $9A / $BD8A STA $044C,X
  o.xvel[i] = hi;                        // $BD8D LDA $99 / $BD8F STA $042C,X
  let c = lo & 1;                        // $BD92 LSR $99 / $BD94 ROR $9A
  lo = (lo >> 1) | ((hi & 1) << 7); hi >>= 1;
  if (state.zp1A !== 0) {                // $BD96 LDA $1A / $BD98 BEQ $BDAF
    let s = lo + o.xvelf[i] + c;         // $BD9A LDA $9A / ADC $044C,X
    o.xvelf[i] = u8(s);
    s = hi + o.xvel[i] + (s > 0xFF ? 1 : 0);     // $BDA2 LDA $99 / ADC $042C,X
    o.xvel[i] = u8(s);
    o.yvelf[i] = 0x80;                   // $BDAA LDA #$80 / $BDAC STA $03EC,X
  }
  c = lo & 1;                            // $BDAF LSR $99 / $BDB1 ROR $9A
  lo = (lo >> 1) | ((hi & 1) << 7); hi >>= 1;
  if (state.zp17 >= 2) {                 // $BDB3 LDA $17 / CMP #$02 / BCC $BDD1
    let s = lo + o.xvelf[i] + 1;         // $BDB9 LDA $9A / ADC $044C,X, carry SET
    o.xvelf[i] = u8(s);
    s = hi + o.xvel[i] + (s > 0xFF ? 1 : 0);     // $BDC1 LDA $99 / ADC $042C,X
    o.xvel[i] = u8(s);
    s = o.yvelf[i] + 0x40 + (s > 0xFF ? 1 : 0);  // $BDC9 LDA $03EC,X / ADC #$40
    o.yvelf[i] = u8(s);
  }
}                                        // $BDD1 RTS

/**
 * `$BC19` -- ten iterations over the enemy-BULLET slots, moving each live one.
 *
 *   BC19  A2 13     LDX #$13 / 86 A9 STX $A9      <-- $13 = $0A + 9
 *   BC1D  A2 09     LDX #$09 / 86 A8 STX $A8
 *   BC21  A6 A8     LDX $A8 / BD 36 01 LDA $0136,X / F0 03 BEQ $BC2B
 *   BC28  20 D5 BD  JSR $BDD5
 *   BC2B  C6 A9 / C6 A8 / 10 F0                   BOTH counters step
 *
 * The loop carries TWO indices for the same ten slots: `$A8` counts 9..0 and
 * addresses them as `$0136,X`, `$A9` counts $13..$0A and addresses them as
 * `$010C,X`. $0120 + 22 + n and $0100 + $0C + $0A + n are the same byte. The
 * port keeps both because `$BDD5` reads `$A9` and nothing else passes it.
 */
function bulletUpdate(state, res) {
  state.work.bulletSlots = 0;
  for (let x = 9; x >= 0; x--) {         // $BC1D LDX #$09 / $BC2F BPL $BC21
    state.spawn.zA8 = x;                 // $BC1F STX $A8
    state.spawn.zA9 = u8(0x0A + x);      // $BC19 LDX #$13 / $BC2B DEC $A9
    state.work.bulletSlots += 1;
    if (state.obj.anim[22 + x] !== 0) {  // $BC23 LDA $0136,X / BEQ $BC2B
      moveBullet(state, res, x);         // $BC28 JSR $BDD5
    }
  }
  state.spawn.zA8 = 0xFF;                // $BC2D's DEC failed the BPL
  state.spawn.zA9 = 0x09;                // ...and $BC2B's left $A9 at $0A - 1
  // docs/knowledge/06 mechanism (C): TEN, unconditionally, no early exit, no
  // work budget. Asserted rather than assumed, like every other object loop.
  if (state.work.bulletSlots !== ENEMY_SLOTS) {
    throw new Error(`$BC19 ran ${state.work.bulletSlots} slots, not ${ENEMY_SLOTS}`);
  }
}

/**
 * `$BDD5-$BE6D` -- move ONE enemy bullet, animate it, and free it off-screen.
 *
 *   BDD5  A6 A9     LDX $A9                       X = $0A + slot
 *   BDD7  BC 0C 01  LDY $010C,X / F0 1E BEQ $BDFA status 0 -> NO animation
 *   BDDC  BD 4C 01  LDA $014C,X / D0 16 BNE $BDF7 timer running -> just DEC
 *   BDE1  A9 10     LDA #$10 / 9D 4C 01 STA $014C,X
 *   BDE6  C8 / C0 04 / 90 02 / A0 01              Y := Y+1, wrapping 4 -> 1
 *   BDED  B9 D1 BD  LDA $BDD1,Y / 9D 2C 01 STA $012C,X
 *   BDF3  98 / 9D 0C 01                           status := Y
 *   BDF7  DE 4C 01  DEC $014C,X
 *   BDFA  BD 6C 04  LDA $046C,X / C9 02 / 90 16   bit 1 of the direction byte
 *   BE01  ...       X += $042C:$044C   (16-bit, fraction first)
 *   BE17  ...       X -= $042C:$044C
 *   BE2A  C9 02 / 90 3D / C9 FC / B0 39           X outside [2, $FB] -> free
 *   BE32  BD 6C 04  LDA $046C,X / 29 01 / F0 16   bit 0
 *   BE39  ...       Y += $03BC:$03EC
 *   BE4F  ...       Y -= $03BC:$03EC
 *   BE62  C9 08 / 90 05 / C9 C4 / B0 01 / 60      Y outside [8, $C3] -> free
 *   BE6B  4C F8 AE  JMP $AEF8                     the SHORT free, X = $0A+slot
 *
 * THE X TEST RETURNS. `$BE2C`/`$BE30` jump to `$BE6B`, which is a JMP into
 * `$AEF8`, so a bullet that leaves the sides never runs the Y update at all --
 * its `$0336`/`$0356` keep the values it had one frame ago, and `$AEF8` does
 * not clear them. That difference is observable in the watched arrays.
 *
 * THE ANIMATION IS DEAD CODE ON THIS PATH AND IS PORTED ANYWAY. `$BC8B` sets
 * the new bullet's status to 0, so `$BDDA BEQ` always leaves and `$BDD1,Y` is
 * never read -- MEASURED $BDE1 n=0 over every run made here. It is reachable
 * from the OTHER two producers ($B3B9/$B4B3/$B4FA, both unported handlers),
 * and it is four lines, so it is transcribed rather than made a throw. Note
 * `$BDD1` itself is the routine's own RTS byte ($60): Y is at least 1 by
 * construction, so entry 0 is unreachable, which is why the exported table
 * carries it and the port never indexes it.
 */
function moveBullet(state, res, x) {
  const o = state.obj;
  const rom = res.enemyTables;
  const i = 22 + x;                      // $BDD5 LDX $A9, $010C + $0A + x
  let y = o.status[i];                   // $BDD7 LDY $010C,X
  if (y !== 0) {                         // $BDDA BEQ $BDFA
    if (o.timer[i] === 0) {              // $BDDC LDA $014C,X / $BDDF BNE $BDF7
      o.timer[i] = 0x10;                 // $BDE1/$BDE3
      y = u8(y + 1);                     // $BDE6 INY
      if (y >= 4) y = 1;                 // $BDE7 CPY #$04 / BCC / $BDEB LDY #$01
      o.anim[i] = rom.read(0xBDD1 + y);  // $BDED LDA $BDD1,Y / $BDF0 STA $012C,X
      o.status[i] = y;                   // $BDF3 TYA / $BDF4 STA $010C,X
    }
    o.timer[i] = u8(o.timer[i] - 1);     // $BDF7 DEC $014C,X
  }
  const dir = o.s0460[i];                // $BDFA LDA $046C,X
  let nx;
  // `CMP #$02 / BCC` and `AND #$02` agree for every value $BD21 can put in
  // $046C -- $A0 is built by two INYs from 0, so dir is 0..3. Written as the
  // ROM's compare anyway; a deliberate `dir & 2` was measured GREEN on all
  // four scenarios AND on the unit suite, which is what it should be.
  if (dir >= 2) {                        // $BDFD CMP #$02 / $BDFF BCC $BE17
    const f = o.xf[i] + o.xvelf[i];      // $BE01 LDA $044C,X / CLC / ADC $038C,X
    o.xf[i] = u8(f);                     // $BE08 STA $038C,X
    nx = u8(o.x[i] + o.xvel[i] + (f > 0xFF ? 1 : 0));   // $BE0B/$BE0E ADC $036C,X
    o.x[i] = nx;                         // $BE11 STA $036C,X
  } else {
    const f = o.xf[i] - o.xvelf[i];      // $BE17 LDA $038C,X / SEC / SBC $044C,X
    o.xf[i] = u8(f);                     // $BE1E STA $038C,X
    nx = u8(o.x[i] - o.xvel[i] - (f < 0 ? 1 : 0));      // $BE21/$BE24 SBC $042C,X
    o.x[i] = nx;                         // $BE27 STA $036C,X
  }
  // $BE2A CMP #$02 / BCC $BE6B / CMP #$FC / BCS $BE6B -- A is the X just stored
  if (nx < 2 || nx >= 0xFC) { freeSlot(state, u8(0x0A + x)); return; }
  let ny;
  if (dir & 1) {                         // $BE32 LDA $046C,X / AND #$01 / BEQ $BE4F
    const f = o.yf[i] + o.yvelf[i];      // $BE39 LDA $03EC,X / CLC / ADC $034C,X
    o.yf[i] = u8(f);                     // $BE40 STA $034C,X
    ny = u8(o.y[i] + o.yvel[i] + (f > 0xFF ? 1 : 0));   // $BE43/$BE46 ADC $032C,X
    o.y[i] = ny;                         // $BE49 STA $032C,X
  } else {
    const f = o.yf[i] - o.yvelf[i];      // $BE4F LDA $034C,X / SEC / SBC $03EC,X
    o.yf[i] = u8(f);                     // $BE56 STA $034C,X
    ny = u8(o.y[i] - o.yvel[i] - (f < 0 ? 1 : 0));      // $BE59/$BE5C SBC $03BC,X
    o.y[i] = ny;                         // $BE5F STA $032C,X
  }
  // $BE62 CMP #$08 / BCC $BE6B / CMP #$C4 / BCS $BE6B / $BE6A RTS
  if (ny < 8 || ny >= 0xC4) freeSlot(state, u8(0x0A + x));
}

// ==================== THE UPDATE LOOP, $ADAB / $ADE5 ========================

/**
 * `$ADAB` -- update all ten enemy slots, 9 down to 0, unconditionally.
 *
 * docs/knowledge/06 mechanism (C) -- an object loop that only partially
 * completes on a heavy frame -- is answered NO here, and it is MEASURED:
 * 15900 entries to $ADE5 over 1590 calls to $ADAB on a 1900-frame stage-1 run,
 * and 26630 over 2663 on the recon's 3000-frame run. Exactly ten, every frame,
 * occupied or not. `state.work.enemySlots` carries the count so a regression is
 * visible rather than inferred.
 */
export function updateEnemies(state, res) {
  const rom = res.enemyTables;
  const sp = state.spawn;
  sp.zAF = 0x80;                         // $ADAB LDA #$80 / STA $AF
  sp.zAE = 0x00;                         // $ADAF LDA #$00 / STA $AE
  sp.zA8 = 9;                            // $ADB3 LDX #$09 / $ADB5 STX $A8
  state.work.enemySlots = 0;
  do {
    updateSlot(state, rom, sp.zA8);      // $ADB7 LDX $A8 / $ADB9 JSR $ADE5
    state.work.enemySlots += 1;
    sp.zA8 = u8(sp.zA8 - 1);             // $ADBC DEC $A8
  } while (!(sp.zA8 & 0x80));            // $ADBE BPL $ADB7
  if (state.work.enemySlots !== ENEMY_SLOTS) {
    throw new Error(`$ADAB ran ${state.work.enemySlots} slots, not ${ENEMY_SLOTS}`);
  }
}

/** `$ADE5` -- one slot: the status animator, then the per-type dispatch. */
function updateSlot(state, rom, j) {
  const o = state.obj;
  const i = j + ENEMY_BASE;
  const status = o.status[i];            // $ADE5 LDA $010C,X
  // $ADE8 BMI $AE14 (bit 7 = armoured) and $ADEA BEQ $AE14 (0 = no auto-anim,
  // which is what a single-spawn enemy gets -- $A3B1 writes no $010C).
  if (!(status & 0x80) && status !== 0) {
    if (o.timer[i] === 0) {              // $ADEC LDA $014C,X / BNE $AE11
      o.timer[i] = 6;                    // $ADF1 LDA #$06 / STA $014C,X
      const base = u8(status << 2);      // $ADF6 LDA $010C,X / ASL / ASL -> $98
      // $ADFD INC $016C,X / AND #$03 / CLC / ADC $98 / TAY / LDA $ADC1,Y and
      // $AE0C BEQ $ADFD -- a 0 byte means "wrap and re-read", which is how the
      // three-entry capsule groups (status 6 and 7) work.
      for (let guard = 0; ; guard++) {
        o.animFrame[i] = u8(o.animFrame[i] + 1);
        const ms = rom.read(0xADC1 + u8((o.animFrame[i] & 3) + base));
        if (ms !== 0) { o.anim[i] = ms; break; }   // $AE0E STA $012C,X
        if (guard >= 4) {
          throw new Error(`$ADC1 group for status ${status} is four zeroes: `
                        + '$AE0C would spin forever on the cartridge');
        }
      }
    }
    o.timer[i] = u8(o.timer[i] - 1);     // $AE11 DEC $014C,X
  }
  const type = o.type[i];                // $AE14 LDA $030C,X
  if (type === 0) return;                // $AE17 BEQ $AE70 (the RTS)
  dispatch(state, rom, j, type);         // $AE19 JSR $83E4, table at $AE1C
}

/**
 * `$AE19 JSR $83E4` with the inline 42-entry table at `$AE1C`.
 *
 * `$83E4` is `ASL A` and then a jump through `table + A` -- and the ASL is
 * EIGHT BIT, so the handler index is `type AND $7F`. Type $85 and type $05 run
 * the same code. Proved by counting rather than by reading the listing:
 * hdlr05 4840 == typeHist[$05] 32 + typeHist[$85] 4808, hdlr08 3954 ==
 * 20 + 3934, hdlr04 570 == 10 + 560. Exact, three for three.
 */
function dispatch(state, rom, j, type) {
  const a = u8(type << 1);               // $83E4 ASL A
  if (a >= 84) {
    throw new Error(`enemy type ${hex2(type)} indexes entry ${a >> 1} of the `
                  + '42-entry table at $AE1C; on the cartridge that reads the '
                  + 'code at $AE70 onward as a pointer');
  }
  const target = rom.word(0xAE1C + a);
  switch (target) {
    case 0xAE70: return;                 // entries 0 and 31: the bare RTS
    case 0xAEDD: return h_AEDD(state);
    case 0xAE99: return h_AE99(state, rom, j);
    case 0xAEE1: return h_AEE1(state);
    case 0xB026: return h_B026(state, rom, j);   // entry 17, types $11/$91
    case 0xB098: return h_B098(state, rom, j);   // entry 18, types $12/$92
    case 0xB0AF: return h_B0AF(state, j);
    case 0xB198: return h_B198(state, rom, j);
    case 0xB205: return h_B205(state, j);
    case 0xB26C: return h_B26C(state, j);
    // ---- WAVE 22: the six routines between scroll $0440 and the boss ------
    case 0xB6E1: return h_B6E1(state, rom, j);   // entry  7, types $07/$87
    case 0xB747: return h_B747(state, rom, j);   // entry 19, types $13/$93
    case 0xAF2E: return h_AF2E(state, rom, j);   // entry 15, types $0F/$8F
    case 0xAF88: return h_AF88(state, rom, j);   // entry 16, types $10/$90
    case 0xB311: return h_B311(state, rom, j);   // entry  9, types $09/$89
    case 0xB3CB: return h_B3CB(state, rom, j);   // entry 12, types $0C/$8C
    default:
      // THE MESSAGE THIS USED TO CARRY WAS "no measured run has ever
      // dispatched it", and that sentence is the one this whole follow-up
      // exists to retire: it was a fact about our corpus, read back as a claim
      // about the cartridge, and it was wrong twice in one evening of ordinary
      // play. Wave 12 measured the truth instead, with an exec hook on all 42
      // handler addresses over 27,400 cartridge frames of seven scripts
      // (tools/oracle/throwaudit.py). FIVE of the entries still listed here are
      // REACHED IN PLAY: $B6E1 (entry 7, first at frame 2490), $B747 (19, 2498),
      // $B311 (9, 2783), $AF2E (15, 2778) and $AF88 (16, 5018) -- the last three
      // only on a run carrying power-ups. The rest were not reached by those
      // seven scripts, which is a smaller statement than "unreachable" and is
      // deliberately worded that way.
      throw new Error(`unimplemented enemy handler ${hex4(target)} for type `
                    + `${hex2(type)} (entry ${a >> 1} of the 42-entry table at `
                    + `$AE1C) in slot ${j + ENEMY_BASE}. Port it against the `
                    + 'cartridge, do not guess it from the listing; the '
                    + 'reachability table is in '
                    + 'docs/worklog/gradius/12-impl-spawn-and-throw-audit.md.');
  }
}

// ============================ SHARED MOVEMENT ===============================
// $B120-$B197. X is the enemy INDEX 0..9 throughout; the +$0C is folded into
// every address the ROM writes.

/** `$B120` -- Y velocity -= acceleration ($048C), 16-bit. */
function velSubAccel(state, j) {
  const o = state.obj; const i = j + ENEMY_BASE;
  const v = o.yvelf[i] - o.s0480[i];     // $B120 LDA $03EC,X / SEC / SBC $048C,X
  o.yvelf[i] = u8(v);
  if (v < 0) o.yvel[i] = u8(o.yvel[i] - 1);   // $B12A BCS / $B12C DEC $03BC,X
}

/** `$B130` -- Y velocity += acceleration. */
function velAddAccel(state, j) {
  const o = state.obj; const i = j + ENEMY_BASE;
  const v = o.yvelf[i] + o.s0480[i];     // $B130 LDA $03EC,X / CLC / ADC $048C,X
  o.yvelf[i] = u8(v);
  if (v > 0xFF) o.yvel[i] = u8(o.yvel[i] + 1);  // $B13A BCC / $B13C INC $03BC,X
}

/** `$B140` -- Y -= (yvel int : yvel frac), 16-bit. */
function subY16(state, j) {
  const o = state.obj; const i = j + ENEMY_BASE;
  const f = o.yf[i] - o.yvelf[i];        // $B140 LDA $034C,X / SEC / SBC $03EC,X
  o.yf[i] = u8(f);
  o.y[i] = u8(o.y[i] - o.yvel[i] - (f < 0 ? 1 : 0));   // $B14A SBC $03BC,X
}

/** `$B16C` -- Y += (yvel int : yvel frac), 16-bit. */
function addY16(state, j) {
  const o = state.obj; const i = j + ENEMY_BASE;
  const f = o.yf[i] + o.yvelf[i];        // $B16C LDA $03EC,X / CLC / ADC $034C,X
  o.yf[i] = u8(f);
  o.y[i] = u8(o.y[i] + o.yvel[i] + (f > 0xFF ? 1 : 0));  // $B176 ADC $032C,X
}

/** `$B17C` -- Y += A (integer only). `$B17D` is the same entry without the CLC. */
function addAY(state, j, a) {
  const o = state.obj; const i = j + ENEMY_BASE;
  o.y[i] = u8(o.y[i] + a);               // $B17C CLC / $B17D ADC $032C,X / STA
}

/** `$B154` -- X += (xvel int : xvel frac), 16-bit. Returns the new integer X. */
function addX16(state, j) {
  const o = state.obj; const i = j + ENEMY_BASE;
  const f = o.xf[i] + o.xvelf[i];        // $B154 LDA $044C,X / CLC / ADC $038C,X
  o.xf[i] = u8(f);
  // $B15E LDA $042C,X / JMP $B165 -- $B165 does NOT clear the carry, so the
  // fraction's carry propagates. That is what makes this a real 16-bit add.
  o.x[i] = u8(o.x[i] + o.xvel[i] + (f > 0xFF ? 1 : 0));
  return o.x[i];
}

/** `$B164` -- X += A (integer only, carry cleared). Returns the new X. */
function addAX(state, j, a) {
  const o = state.obj; const i = j + ENEMY_BASE;
  o.x[i] = u8(o.x[i] + a);               // $B164 CLC / $B165 ADC $036C,X / STA
  return o.x[i];
}

/**
 * `$B184` -- X -= (xvel int : xvel frac), 16-bit. The mirror of $B154.
 *
 * WAVE 12 PORTED THIS. Until now it was deliberately absent, with a note saying
 * its only call sites are $B1E5 and $B1FA, both inside handler 6's run path,
 * and that path was a throw. Handler 6 ($B198) is ported below, so $B1E5 is
 * live: it is the arm that turns the arcing enemy around and flies it back
 * RIGHT. $B1FA is still unreachable -- it belongs to $B37C and $B459, two
 * handlers that are still throws.
 */
function subX16(state, j) {
  const o = state.obj; const i = j + ENEMY_BASE;
  const f = o.xf[i] - o.xvelf[i];        // $B184 LDA $038C,X / SEC / SBC $044C,X
  o.xf[i] = u8(f);
  // $B18E LDA $036C,X / SBC $042C,X -- the fraction's borrow propagates, which
  // is what makes this 16-bit rather than two independent bytes.
  o.x[i] = u8(o.x[i] - o.xvel[i] - (f < 0 ? 1 : 0));
}

/**
 * `$B251` -- the shared off-screen box, tail-called by most handlers.
 *
 * KEEP the slot only while X is in [$04, $F3] and Y is in [$08, $C3]; free it
 * otherwise. `$B250` is the bare RTS the "keep" branch lands on.
 */
function offScreenCheck(state) {
  const j = state.spawn.zA8;             // $B251 LDX $A8 -- reloads X
  const o = state.obj; const i = j + ENEMY_BASE;
  const x = o.x[i];                      // $B253 LDA $036C,X
  if (x < 0x04) return freeSlot(state, j);        // $B256 CMP #$04 / BCC $B269
  if (x >= 0xF4) return freeSlot(state, j);       // $B25A CMP #$F4 / BCS $B269
  const y = o.y[i];                      // $B25E LDA $032C,X
  if (y < 0x08) return freeSlot(state, j);        // $B261 CMP #$08 / BCC $B269
  if (y < 0xC4) return;                  // $B265 CMP #$C4 / BCC $B250 (RTS)
  return freeSlot(state, j);             // $B269 JMP $AEF8
}

/**
 * `$B0B4` -- set the "initialised" bit. Shared by $B0AF, $B198, $B205, $B26C.
 *
 * It is an ADD, not an OR: `LDA #$80 / CLC / ADC $030C,X`. On a type that
 * ALREADY has bit 7 set that WRAPS and CLEARS it -- which $B205's $B23C arm
 * relies on to re-run its own init.
 */
function setInitialised(state, j) {
  const o = state.obj; const i = j + ENEMY_BASE;
  o.type[i] = u8(0x80 + o.type[i]);      // $B0B4 LDA #$80 / CLC / ADC / STA
}

// ============================== THE HANDLERS ================================

/**
 * Handler 1, `$AEDD` -- the power-up capsule. Two instructions of its own, then
 * it falls through into handler 3's mover.
 */
function h_AEDD(state) {
  if (state.zp5B !== 0) return;          // $AEDD LDA $5B / BNE $AF09
  h_AEE1(state);                         // falls through into $AEE1
}

/**
 * Handler 3, `$AEE1` -- the generic drift every unhandled object gets:
 * 0.5 px/frame LEFT, freed once the integer X drops below 8.
 */
function h_AEE1(state) {
  const j = state.spawn.zA8;             // $AEE1 LDX $A8 -- reloads X
  const o = state.obj; const i = j + ENEMY_BASE;
  const v = o.xf[i] - 0x80;              // $AEE3 LDA $038C,X / SEC / SBC #$80
  o.xf[i] = u8(v);
  if (v >= 0) return;                    // $AEEC BCS $AF09 -- no borrow
  o.x[i] = u8(o.x[i] - 1);               // $AEEE DEC $036C,X
  if (o.x[i] >= 0x08) return;            // $AEF1 CMP #$08 / BCS $AF09
  freeSlot(state, j);                    // $AEF8
}

/**
 * Handler 2, `$AE99` -- the explosion-script player, and the capsule promotion.
 *
 * Measured end to end: a type $85 kill becomes type 2 / status 0 for 19 frames
 * playing metasprites 38, 39, 40 (script 0 = `26 27 28 00`), then $AEC1 turns
 * it into type 1 / status 6 -- metasprites 16, 17, 18 -- which then drifts left
 * under $AEE1 for 51 frames.
 *
 * Nothing in wave 3's corpus reached it: it is entered only from $BE93, the
 * kill routine, which wave 6 ported above. `autofire-laser` is the scenario
 * that drives it -- three capsule promotions ($AEC1) from f527 on, compared per
 * frame. It is here rather than beside $BE93 because the fall-through below IS
 * handlers 1 and 3, and splitting them would misrepresent the control flow.
 */
function h_AE99(state, rom, j) {
  const o = state.obj; const i = j + ENEMY_BASE;
  if (o.timer[i] !== 0) return tail(state, j);     // $AE9C BNE $AEDA
  o.timer[i] = 5;                        // $AE9E LDA #$05 / STA $014C,X
  const y = u8(o.animFrame[i] << 1);     // $AEA3 LDA $016C,X / ASL / TAY
  const ptr = rom.word(0xAE71 + y);      // $AEA8 / $AEAD -> $98:$99
  const cur = o.xvel[i];                 // $AEB2 LDY $042C,X -- the script cursor
  o.xvel[i] = u8(cur + 1);               // $AEB5 INC $042C,X
  const b = rom.read(u16(ptr + cur));    // $AEB8 LDA ($98),Y
  if (b !== 0) {                         // $AEBA BNE $AED7
    o.anim[i] = b;                       // $AED7 STA $012C,X
    return tail(state, j);
  }
  if (o.carrier[i] === 0) return freeSlot(state, j);   // $AEBC LDY $03AC,X / BEQ
  // $AEC1: the explosion becomes a power-up capsule.
  o.type[i] = 1;                         // $AEC1 LDA #$01 / STA $030C,X
  let s = 7;                             // $AEC6 LDY #$07 -- the gold capsule
  state.zp47 = u8(state.zp47 + 1);       // $AEC8 INC $47
  if ((state.zp47 & 0x0F) !== 0) s = 6;  // $AECC AND #$0F / BEQ / $AED0 LDY #$06
  o.status[i] = s;                       // $AED2 TYA / STA $010C,X
}

/** `$AEDA` -- $AE99's tail, which falls through into $AEDD and then $AEE1. */
function tail(state, j) {
  const o = state.obj; const i = j + ENEMY_BASE;
  o.timer[i] = u8(o.timer[i] - 1);       // $AEDA DEC $014C,X
  h_AEDD(state, j);                      // FALL-THROUGH, not a call the ROM makes
}

/**
 * Handler 5, `$B0AF` -- THE FAN. Stage 1 opens with it (cmd $80 and $81).
 *
 * Four sub-states in `$048C+i`:
 *   0  fly left at 2 px/frame until the integer X drops below $60; then arm a
 *      64-frame curve timer and pick a direction by the enemy's OWN Y --
 *      Y >= $80 becomes sub-state 2 (curve up), otherwise 1 (curve down).
 *   1  step Y +2 and X +1 per frame; switch to 3 when Y reaches the player's Y
 *      or the 64 frames run out.
 *   2  the same with Y -2, switching at Y below the player's.
 *   3  fly right at 3 px/frame, then the shared off-screen box.
 *
 * Sub-state >= 4 is a bare RTS on the cartridge ($B0CC) and is reproduced.
 */
function h_B0AF(state, j) {
  const o = state.obj; const i = j + ENEMY_BASE;
  if (!(o.type[i] & 0x80)) {             // $B0AF LDA $030C,X / BMI $B0BE
    setInitialised(state, j);            // $B0B4 -- one motionless frame
    return;
  }
  switch (o.s0480[i]) {                  // $B0BE LDY $048C,X, then three DEYs
    case 0: {                            // $B0CD
      const x = addAX(state, j, 0xFE);   // $B0CD LDA #$FE / JSR $B164
      if (x >= 0x60) return;             // $B0D2 CMP #$60 / BCS $B0E8
      o.s0460[i] = 0x40;                 // $B0D6 LDA #$40 / STA $046C,X
      // $B0DB LDA $032C,X / CMP #$80 / BCC $B0E5 -- the extra INC is what makes
      // the lower half of the squadron curve UP instead of DOWN.
      if (o.y[i] >= 0x80) o.s0480[i] = u8(o.s0480[i] + 1);   // $B0E2 INC $048C,X
      o.s0480[i] = u8(o.s0480[i] + 1);   // $B0E5 INC $048C,X
      return;
    }
    case 1:                              // $B0E9
      homeDown(state, j);                // $B0E9 JSR $B109
      return curveStep(state, j, 0x02);  // $B0EC LDA #$02 -> $B0EE
    case 2:                              // $B0FA
      homeUp(state, j);                  // $B0FA JSR $B117
      // $B0FD LDA #$FE / BNE $B0EE -- rejoins sub-state 1's body with A = $FE
      return curveStep(state, j, 0xFE);
    case 3:                              // $B101
      addAX(state, j, 0x03);             // $B101 LDA #$03 / JSR $B164
      return offScreenCheck(state);      // $B106 JMP $B251
    default:
      return;                            // $B0CC RTS
  }
}

/** `$B0EE`-`$B0F9` -- the body sub-states 1 and 2 share. */
function curveStep(state, j, dy) {
  const o = state.obj; const i = j + ENEMY_BASE;
  addAY(state, j, dy);                   // $B0EE JSR $B17C
  o.x[i] = u8(o.x[i] + 1);               // $B0F1 INC $036C,X
  o.s0460[i] = u8(o.s0460[i] - 1);       // $B0F4 DEC $046C,X
  if (o.s0460[i] === 0) o.s0480[i] = 3;  // $B0F7 BEQ $B111 -- the 64-frame curve
}

/** `$B109` -- sub-state 1 gives up once it is at or below the player's Y. */
function homeDown(state, j) {
  const o = state.obj; const i = j + ENEMY_BASE;
  // $B109 LDA $032C,X / CMP $0320 / BCC $B116 -- $0320 is the PLAYER's Y
  if (o.y[i] >= state.obj.y[0]) o.s0480[i] = 3;    // $B111 LDA #$03 / STA $048C,X
}

/** `$B117` -- sub-state 2's mirror: give up once above the player's Y. */
function homeUp(state, j) {
  const o = state.obj; const i = j + ENEMY_BASE;
  if (o.y[i] < state.obj.y[0]) o.s0480[i] = 3;     // $B11D BCC $B111
}

/**
 * Handler 8, `$B26C` -- the "wavy" enemy stage 1's cmd $82 waves spawn.
 *
 * It marches left 1 px/frame and closes on the player's Y at $048C/256 = 0.5
 * px/frame, choosing its direction EVERY frame.
 *
 * A LITERAL TRANSLATION OF A ROM ODDITY, kept because it is what the cartridge
 * does: `$B2A5 DEC $046C,X / BEQ $B2AF / LDA #$00 / STA $046C,X` stores ZERO
 * whenever the decrement did NOT reach zero. So the $1E phase counters at
 * $046C/$04AC are seeded to 30 and then immediately zeroed, the `BNE` tests at
 * $B27F/$B284 never fire, and the Y comparison is re-run on every frame. The
 * evidence that this is real: all three metasprites the routine can write
 * appear in the measured histograms -- $38/56 (closing down), $39/57 (closing
 * up) and $3A/58 (Y-aligned, flying left at 2 px/frame) -- e.g. slot 14 read
 * 57 for 72 frames and 58 for 82.
 */
function h_B26C(state, j) {
  const o = state.obj; const i = j + ENEMY_BASE;
  if (!(o.type[i] & 0x80)) {             // $B26C LDA $030C,X / BMI $B27F
    o.s0480[i] = 0x80;                   // $B271 LDA #$80 / STA $048C,X
    o.s04A0[i] = 0x00;                   // $B276 LDA #$00 / STA $04AC,X
    setInitialised(state, j);            // $B27B JSR $B0B4
    return;
  }
  if (o.s0460[i] !== 0) return closeDown(state, j);   // $B27F BNE $B29D
  if (o.s04A0[i] !== 0) return closeUp(state, j);     // $B284 BNE $B2C0
  o.anim[i] = 0x3A;                      // $B289 LDA #$3A / STA $012C,X
  const py = state.obj.y[0];             // $B291 CMP $0320
  if (o.y[i] === py) {                   // $B294 BEQ $B2DB
    addAX(state, j, 0xFE);               // $B2DB LDA #$FE / JMP $B103 -> $B164
    return offScreenCheck(state);        // $B106 JMP $B251
  }
  if (o.y[i] < py) {                     // $B296 BCC $B2BB
    o.s04A0[i] = 0x1E;                   // $B2BB LDA #$1E / STA $04AC,X
    return closeUp(state, j);
  }
  o.s0460[i] = 0x1E;                     // $B298 LDA #$1E / STA $046C,X
  return closeDown(state, j);
}

/** `$B29D` -- march left, draw the "closing down" frame, move Y UP. */
function closeDown(state, j) {
  const o = state.obj; const i = j + ENEMY_BASE;
  o.x[i] = u8(o.x[i] - 1);               // $B29D DEC $036C,X
  o.anim[i] = 0x38;                      // $B2A0 LDA #$38 / STA $012C,X
  o.s0460[i] = u8(o.s0460[i] - 1);       // $B2A5 DEC $046C,X
  if (o.s0460[i] !== 0) o.s0460[i] = 0;  // $B2A8 BEQ $B2AF / $B2AA-$B2AE -- see
                                         //   the header: this always ends at 0
  stashY(state, j);                      // $B2AF JSR $B2EE
  velSubAccel(state, j);                 // $B2B2 JSR $B120
  unstashY(state, j);                    // $B2B5 JSR $B304
  offScreenCheck(state);                 // $B2B8 JMP $B251
}

/** `$B2C0` -- the mirror: "closing up" frame, move Y DOWN. */
function closeUp(state, j) {
  const o = state.obj; const i = j + ENEMY_BASE;
  o.x[i] = u8(o.x[i] - 1);               // $B2C0 DEC $036C,X
  o.anim[i] = 0x39;                      // $B2C3 LDA #$39 / STA $012C,X
  o.s04A0[i] = u8(o.s04A0[i] - 1);       // $B2C8 DEC $04AC,X
  if (o.s04A0[i] !== 0) o.s04A0[i] = 0;  // $B2CB BEQ $B2D2 / $B2CD-$B2D1
  stashY(state, j);                      // $B2D2 JSR $B2EE
  velAddAccel(state, j);                 // $B2D5 JSR $B130
  unstashY(state, j);                    // $B2D8 JMP $B2B5 -> JSR $B304
  offScreenCheck(state);                 // $B2B8 JMP $B251
}

/**
 * `$B2EE` -> `$B2E6` -- copy Y ($032C:$034C) into the VELOCITY pair
 * ($03BC:$03EC) so $B120/$B130 can do 16-bit arithmetic on it, and `$B304` to
 * copy it back. The routine borrows the velocity bytes as scratch; that is why
 * a type-8 enemy's $03BC/$03EC read as its Y rather than as a speed.
 */
function stashY(state, j) {
  const o = state.obj; const i = j + ENEMY_BASE;
  o.yvel[i] = o.y[i];                    // $B2EE LDA $032C,X -> $B2E6 STA $03BC,X
  o.yvelf[i] = o.yf[i];                  // $B2F1 LDY $034C,X -> $B2EA STA $03EC,X
}

function unstashY(state, j) {
  const o = state.obj; const i = j + ENEMY_BASE;
  o.y[i] = o.yvel[i];                    // $B304 LDA $03BC,X / STA $032C,X
  o.yf[i] = o.yvelf[i];                  // $B30A LDA $03EC,X / STA $034C,X
}

/**
 * Handler 6, `$B198`, and handler 4, `$B205` -- two arcing enemies whose code
 * is INTERLEAVED: $B205 jumps into $B1B1, $B1DF and $B1F1, and $B22E is inside
 * $B205 but is reached from $B217 as well. They are transcribed together
 * because separating them would invent a structure the ROM does not have.
 *
 * Type 4 is what stage 1's chunk-1 cmd $83/$84 waves spawn; measured first
 * dispatch at game frame 1722 on the 1900-frame RD run.
 *
 * TYPE 6 IS NOW PORTED (wave 12). Its entry used to be a throw on the reasoning
 * "no measured run has ever dispatched it" -- the same sentence that produced
 * two crashes in ordinary play. It is reached from the SINGLE-ENEMY SPAWN
 * above: stage 1's table-A entries for cmd $01 and cmd $02 are $A6 $81 $B7 and
 * $A6 $80 $B7, and $A6 - $A0 = $06. Those two records fire at scroll $03C0 and
 * $03E0, i.e. 64 and 96 px past the $A3B1 boundary the owner already hit.
 *
 * THE ARC. `$04AC,X` counts arcs and indexes the five-byte schedule at $B200
 * (00 00 01 00 00): 0 means $B1DF (X += xvel, and xvel is $FE, so LEFT) and
 * non-zero means $B1E5 (X -= xvel, so RIGHT). Each arc seeds Y velocity +3 and
 * subtracts $20/256 of acceleration per frame, so the enemy rises, stalls and
 * falls; when the Y velocity has gone past -3 ($B1D0 `CMP #$FD`) the arc
 * counter advances and the next arc is seeded.
 */
function h_B198(state, rom, j) {
  const o = state.obj; const i = j + ENEMY_BASE;
  if (!(o.type[i] & 0x80)) {              // $B198 LDA $030C,X / $B19B BMI $B1C2
    o.status[i] = 2;                      // $B19D LDA #$02 / STA $010C,X
    setInitialised(state, j);             // $B1A2 JSR $B0B4 -- one motionless frame
    o.s04A0[i] = 0;                       // $B1A5 LDA #$00 / $B1A7 STA $04AC,X
    return arcSeed(state, j);             // FALLS THROUGH into $B1AA
  }
  const y = o.s04A0[i];                   // $B1C2 LDY $04AC,X
  if (y >= 5) {
    // $B1C5 `LDA $B200,Y` would read $B205, the `LDA $030C,X` opcode of the
    // NEXT handler, as a turn flag ($BD -- non-zero, i.e. "fly right"). That is
    // a table overrun, and it is a loud throw rather than a silent $BD.
    //
    // MEASURED, and the number is the reason the table is exported at exactly
    // five bytes: an exec hook on $B1C5 reading the Y register over 27,400
    // cartridge frames (tools/oracle/throwaudit.py) saw 2439 executions with
    // Y = 0, 1, 2, 3 and 4 -- EVERY entry -- and never 5. So the enemy really
    // does walk the whole schedule, and $B251's box frees it before the sixth
    // read. This guard is the tripwire for the case the cartridge stops just
    // short of.
    throw new Error(`$B1C5 LDA $B200,Y with $04AC = ${y}: the five-entry arc `
                  + 'schedule at $B200 ends at $B204 and $B205 is st_B205\'s '
                  + `\`LDA $030C,X\` opcode (slot ${j + ENEMY_BASE})`);
  }
  o.s0460[i] = rom.read(0xB200 + y);      // $B1C5 LDA $B200,Y / $B1C8 STA $046C,X
  const yv = o.yvel[i];                   // $B1CB LDA $03BC,X
  // $B1CE BPL $B1DA / $B1D0 CMP #$FD / $B1D2 BCS $B1DA -- advance the arc only
  // once the Y velocity is negative AND past -3.
  if ((yv & 0x80) !== 0 && yv < 0xFD) {
    o.s04A0[i] = u8(o.s04A0[i] + 1);      // $B1D4 INC $04AC,X
    return arcSeed(state, j);             // $B1D7 JMP $B1AA
  }
  if (o.s0460[i] !== 0) subX16(state, j); // $B1DA LDA $046C,X / BNE $B1E5 -> $B184
  else addX16(state, j);                  // $B1DF JSR $B154
  subY16(state, j);                       // $B1E8 JSR $B140
  velSubAccel(state, j);                  // $B1EB JSR $B120
  offScreenCheck(state);                  // $B1EE JMP $B251
}

/** `$B1AA` -- arm the acceleration, then FALL THROUGH into $B1B1 with A = 3. */
function arcSeed(state, j) {
  const o = state.obj;
  o.s0480[j + ENEMY_BASE] = 0x20;         // $B1AA LDA #$20 / STA $048C,X
  seedArc(state, j, 0x03);                // $B1AF LDA #$03 -- falls into $B1B1
}

/** `$B1B1` -- seed the velocities. Entered with A = the Y velocity integer. */
function seedArc(state, j, yvel) {
  const o = state.obj; const i = j + ENEMY_BASE;
  o.yvel[i] = yvel;                      // $B1B1 STA $03BC,X
  o.yvelf[i] = 0;                        // $B1B4 LDA #$00 / STA $03EC,X
  o.xvelf[i] = 0;                        // $B1B9 STA $044C,X
  o.xvel[i] = 0xFE;                      // $B1BC LDA #$FE / STA $042C,X
}

/** `$B1DF` -- X += xvel, Y -= yvel, yvel -= accel, then the box. */
function arcRightUp(state, j) {
  addX16(state, j);                      // $B1DF JSR $B154
  subY16(state, j);                      // $B1E8 JSR $B140
  velSubAccel(state, j);                 // $B1EB JSR $B120
  offScreenCheck(state);                 // $B1EE JMP $B251
}

/** `$B1F1` -- X += xvel, Y += yvel, then $B1F7 JMPs back into $B1EB's tail. */
function arcRightDown(state, j) {
  addX16(state, j);                      // $B1F1 JSR $B154
  addY16(state, j);                      // $B1F4 JSR $B16C
  velSubAccel(state, j);                 // $B1F7 JMP $B1EB -> JSR $B120
  offScreenCheck(state);                 // $B1EE JMP $B251
}

function h_B205(state, j) {
  const o = state.obj; const i = j + ENEMY_BASE;
  if (!(o.type[i] & 0x80)) {             // $B205 LDA $030C,X / BMI $B21A
    o.s0460[i] = 0;                      // $B20A LDA #$00 / STA $046C,X
    setInitialised(state, j);            // $B20F JSR $B0B4
    o.s0480[i] = 0x20;                   // $B212 LDA #$20 / STA $048C,X
    seedArc(state, j, 0x02);             // $B217 JMP $B22E -> LDA #$02 / $B1B1
    return;
  }
  if (o.s0460[i] === 0) {                // $B21A LDA $046C,X / BNE $B233
    const yv = o.yvel[i];                // $B21F LDA $03BC,X
    // $B222 BPL $B228 / $B224 CMP #$FE / BCC $B22B -- the arc flips once the Y
    // velocity has gone negative and passed $FE (i.e. -2).
    if (!(yv & 0x80) || yv >= 0xFE) return arcRightUp(state, j);   // $B228
    o.s0460[i] = u8(o.s0460[i] + 1);     // $B22B INC $046C,X
    seedArc(state, j, 0x02);             // $B22E LDA #$02 / JMP $B1B1
    return;
  }
  const yv = o.yvel[i];                  // $B233 LDA $03BC,X
  if (!(yv & 0x80) || yv >= 0xFE) return arcRightDown(state, j);   // $B236/$B23A
  // $B23C BCC $B20A -- back to the INIT block, which calls $B0B4 again and so
  // WRAPS bit 7 of the type back off. The enemy therefore loses one frame and
  // re-initialises on the next. Literal, on purpose.
  o.s0460[i] = 0;                        // $B20A
  setInitialised(state, j);              // $B20F -- $80 + $84 = $04, bit 7 CLEAR
  o.s0480[i] = 0x20;                     // $B212
  seedArc(state, j, 0x02);               // $B217 -> $B22E -> $B1B1
}

/**
 * Handlers 17 and 18, `$B026` (types $11/$91) and `$B098` (types $12/$92) --
 * THE AIMING TURRET, in its floor and ceiling forms, plus the aim block
 * `$B033`/`$B038` they both fall into.
 *
 * PORTED IN WAVE 12, and reached from the single spawn above: stage 1's cmd $00
 * record is $B2 $80 $12, and $B2 - $A0 = $12, so the first `cmd < $80` wave the
 * game ever fires -- at scroll $0380 -- is a type $12 turret. Wave 10 measured
 * exactly that and pinned it in `deep-page4`'s expectThrow: "the enemy that
 * record spawns is TYPE $92, and $92 AND $7F = $12 indexes entry 18".
 *
 * IT DOES NOT MOVE UNDER ITS OWN POWER. Both forms end `$B083 JMP $AEDD`, i.e.
 * handler 1's 0.5 px/frame left drift, which is the camera's own scroll rate --
 * so a turret sits still relative to the terrain and is freed at X < 8.
 *
 * WHAT IT ACTUALLY DOES is aim. `$B038-$B06C` turns the enemy's position
 * relative to the ship into a direction code 0..5 (three coarse X bands either
 * side, refined by Y only in the two middle ones), and writes TWO things from
 * it: the metasprite ($B086,Y -- the barrel pointing that way) and `$0496,X`,
 * which is the muzzle index `$BC90 LDX $0496,Y` reads when this enemy fires.
 * That is the array wave 11 measured as 0 for every stage-1 squadron; the
 * turret is what makes it non-zero.
 *
 * THE TWO FORMS DIFFER IN THREE BYTES AND NOTHING ELSE:
 *   $B026  type := $91, no attribute change, and `$B033` (arm the shot
 *          countdown `$040C,X` = 10) runs when the turret is ABOVE the ship
 *          (`CPY $0320 / BCS $B038` skips it otherwise);
 *   $B098  type := $92, `$018C,X |= $80` (the vertical flip -- this is the
 *          CEILING form), and `$B033` runs when the turret is BELOW the ship
 *          (`CMP $0320 / BCS $B033`), i.e. the opposite test.
 * Both rewrite their own type EVERY frame, which is also how bit 7 gets set the
 * first time -- there is no $B0B4 here and no init-once branch.
 */
function h_B026(state, rom, j) {
  const o = state.obj; const i = j + ENEMY_BASE;
  o.type[i] = 0x91;                      // $B026 LDA #$91 / $B028 STA $030C,X
  // $B02B LDY $032C,X / $B02E CPY $0320 / $B031 BCS $B038
  if (o.y[i] < o.y[0]) armTurretShot(state, j);   // falls into $B033
  aimTurret(state, rom, j);              // $B038
}

function h_B098(state, rom, j) {
  const o = state.obj; const i = j + ENEMY_BASE;
  o.type[i] = 0x92;                      // $B098 LDA #$92 / $B09A STA $030C,X
  o.attrMask[i] = o.attrMask[i] | 0x80;  // $B09D LDA $018C,X / ORA #$80 / STA
  // $B0A5 LDA $032C,X / CMP $0320 / $B0AB BCS $B033 / $B0AD BCC $B038
  if (o.y[i] >= o.y[0]) armTurretShot(state, j);
  aimTurret(state, rom, j);
}

/**
 * `$B033` -- arm the shot countdown, then FALL THROUGH into $B038.
 *
 * `$040C,X` is the byte `$BBFD` walks down by 1 a frame; at 0 it reloads from
 * `$04EC,X` and calls `$BC44`. Every stage-1 SQUADRON has $04EC = $C8 = 200
 * (wave 11 measured it), so a squadron member takes 200 frames to shoot. This
 * writes TEN. A turret that has the ship on its firing side shoots within a
 * sixth of a second, and it re-arms every frame the ship stays there.
 */
function armTurretShot(state, j) {
  state.obj.style[j + ENEMY_BASE] = 0x0A;   // $B033 LDA #$0A / STA $040C,X
}

/** `$B038`-`$B083` -- the direction code, the metasprite and the muzzle index. */
function aimTurret(state, rom, j) {
  const o = state.obj; const i = j + ENEMY_BASE;
  let y = 0;                             // $B038 LDY #$00
  const dx = o.x[i] - o.x[0];            // $B03A LDA $036C,X / SEC / SBC $0360
  const ax = u8(dx);
  let refine = false;
  if (dx >= 0) {                         // $B041 BCC $B04E -- no borrow
    if (ax >= 0x30) {                    // $B043 CMP #$30 / BCC $B06D
      y = 1;                             // $B047 INY
      // $B048 CMP #$60 / BCC $B06D / $B04C BCS $B059
      if (ax >= 0x60) refine = true;
    }
  } else {
    y = 3;                               // $B04E LDY #$03
    if (ax < 0xD0) {                     // $B050 CMP #$D0 / BCS $B06D
      y = 4;                             // $B054 INY
      // $B055 CMP #$A0 / BCS $B06D, else FALL THROUGH into $B059
      if (ax < 0xA0) refine = true;
    }
  }
  if (refine) {                          // $B059 -- only the two OUTER X bands
    const dy = o.y[i] - o.y[0];          // $B059 LDA $032C,X / SEC / SBC $0320
    const ay = u8(dy);
    if (dy >= 0) {                       // $B060 BCC $B068
      if (ay < 0x30) y += 1;             // $B062 CMP #$30 / BCC $B06C (INY)
    } else if (ay >= 0xD0) {             // $B068 CMP #$D0 / BCC $B06D, else INY
      y += 1;                            // $B06C INY
    }
  }
  o.anim[i] = rom.read(0xB086 + y);      // $B06D LDA $B086,Y / $B070 STA $012C,X
  // $B073 LDA $018C,X / $B076 BPL $B07D -- the flipped form reads the OTHER
  // muzzle row. And `$B07B BNE $B080` is a BRANCH ON THE BYTE JUST LOADED: when
  // $B092,Y is ZERO it is not taken and execution FALLS THROUGH into $B07D,
  // re-loading from $B08C,Y. Both rows are 0 at index 5 and only at index 5, so
  // today this is unobservable -- transcribed anyway, because a table edit that
  // made them differ would make it observable and nobody would know why.
  let muz;
  if ((o.attrMask[i] & 0x80) !== 0) {
    muz = rom.read(0xB092 + y);          // $B078 LDA $B092,Y
    if (muz === 0) muz = rom.read(0xB08C + y);   // fall-through to $B07D
  } else {
    muz = rom.read(0xB08C + y);          // $B07D LDA $B08C,Y
  }
  o.s0480[22 + j] = muz;                 // $B080 STA $0496,X -- the j-INDEXED
                                         //   array, the one $A527 clears with
                                         //   `STA $0496,Y`. NOT s0480[j + 12].
  h_AEDD(state);                         // $B083 JMP $AEDD
}

// ======================= WAVE 22: THE SIX ROUTINES ==========================
//
// Entries 7, 19, 15, 16, 9 and 12 -- everything stage 1's wave script reaches
// between scroll $0440 and the boss page, in the order the game reaches it.
//
// THE DENOMINATORS, quoted from 20-recon-enemy-census.md and NOT re-derived:
// `$AE1C` is 42 entries / 84 bytes / 34 distinct handler routines. Stage 0's
// chunk 2 ($A87A) is the first wave list that names an unported handler --
// trigger $20, cmd $03, type $07 -> entry 7 -> `$B6E1`, at scroll
// `($61 << 8) + trigger*2` = $0400 + $40 = **$0440**. Chunks 0 and 1 contain
// zero unported spawns, which is exactly why the opening plays.
//
// THREE THINGS IN THIS BLOCK ARE FALL-THROUGHS, NOT CALLS. The listing's
// apparent function boundaries are wrong in all three places and each one was
// read past on purpose (docs/knowledge/02 trap 1, TEN prior incidents):
//
//   $B6A2's arm ends `$B6B5 STA $04CC,X` at $B6B7 and runs straight on into
//   `$B6B8`, the metasprite/muzzle picker. A port that treats $B6B8 as a
//   separate subroutine loses the frame's metasprite every time the walker
//   docks.
//
//   $B3D5 `JMP $B3A2` (entry 12's init) lands on two instructions that end at
//   $B3A6 and fall into `$B3A7 JMP $B0B4`. Entry 12 therefore zeroes $048C AND
//   sets the initialised bit; entry 9's init ($B316) does NOT zero $048C. The
//   asymmetry is the cartridge's and is reproduced.
//
//   $AF33 IS SHARED BY BOTH HATCHES -- `$AF8B BPL $AF33` and `$AF96 BNE $AF54`
//   are entry 16 jumping into the MIDDLE of entry 15 twice. Entry 16 is entry
//   15 with three bytes changed (Y = $F6 not $08, A = $0C not $09, metasprite
//   $79 not $78), so it is written that way here.
//
// AND ONE NEAR-MISS, recorded because it looks like a fall-through and is not:
// `$B6E1`'s uninitialised arm is `$B6E8 JSR $B65C / $B6EB JMP $B0B4` -- a JMP,
// so it does NOT run on into $B6EE.

/**
 * `$B65C` -- pick the column the terrain walker docks at: the PLAYER's X plus
 * $30, snapped down to a multiple of 8, clamped to [$20, $F0].
 *
 * The clamp is asymmetric in the ROM and the asymmetry matters: when
 * `player.x + $30` CARRIES, `$B662 BCS $B66A` jumps straight to `LDA #$F0`
 * WITHOUT the `AND #$F8`, so the high clamp is reached two different ways.
 */
function walkerDockColumn(state, j) {
  const o = state.obj; const i = j + ENEMY_BASE;
  const sum = o.x[0] + 0x30;             // $B65C LDA $0360 / CLC / ADC #$30
  let a;
  if (sum > 0xFF) {                      // $B662 BCS $B66A
    a = 0xF0;                            // $B66A LDA #$F0
  } else {
    a = sum & 0xF8;                      // $B664 AND #$F8
    if (a >= 0xF0) a = 0xF0;             // $B666 CMP #$F0 / BCC $B66C / $B66A
  }
  if (a < 0x20) a = 0x20;                // $B66C CMP #$20 / BCS $B672 / $B670
  o.s0480[i] = a;                        // $B672 STA $048C,X
}

/**
 * `$B676` -- the shared docking step, reached by BOTH walkers once the terrain
 * probe has settled their Y for the frame.
 *
 * It compares the walker's own X (snapped to 8) against the docking column and
 * either walks 2 px left, 1 px right, or -- on an exact match -- LOCKS: it
 * loads the rank row `$B6D2[$17]` into the fire interval pair
 * ($04EC/$040C, the same pair $BBFD counts down), bumps the phase `$046C`, and
 * falls through into $B6B8.
 *
 * `$B690 JMP $AEF8` is the free when the walk left takes X below 8. It is also
 * an entry point for `$B7F3` (the mid-boss, entry 23, still a throw).
 */
function walkerDock(state, rom, j) {
  const o = state.obj; const i = j + ENEMY_BASE;
  o.s04E0[i] = 0;                        // $B676 LDA #$00 / STA $04EC,X
  const col = o.x[i] & 0xF8;             // $B67B LDA $036C,X / AND #$F8
  if (col === o.s0480[i]) {              // $B680 CMP $048C,X / $B683 BEQ $B6A2
    const rank = rom.read(0xB6D2 + state.zp17);   // $B6A2 LDY $17 / $B6A4 LDA $B6D2,Y
    o.s04E0[i] = rank;                   // $B6A7 STA $04EC,X   the fire RELOAD
    o.style[i] = rank;                   // $B6AA STA $040C,X   the fire COUNTDOWN
    o.s0460[i] = u8(o.s0460[i] + 1);     // $B6AD INC $046C,X   phase 0 -> 1
    o.status[i] = 0;                     // $B6B0 LDA #$00 / STA $010C,X
    o.s04C0[i] = 0;                      // $B6B5 STA $04CC,X
    return walkerFrame(state, rom, j);   // FALL-THROUGH into $B6B8, not a call
  }
  if (col < o.s0480[i]) {                // $B685 BCC $B697 -- left of the column
    addAX(state, j, 0x01);               // $B697 LDA #$01 / JSR $B164
    o.status[i] = 4;                     // $B69C LDA #$04 / $B69E STA $010C,X
    return;
  }
  const x = addAX(state, j, 0xFE);       // $B687 LDA #$FE / JSR $B164
  if (x < 0x08) return freeSlot(state, j);   // $B68C CMP #$08 / BCS $B693 / $B690
  o.status[i] = 3;                       // $B693 LDA #$03 / $B69E STA $010C,X
}

/**
 * `$B6B8` -- the metasprite and the muzzle index, chosen by which side of the
 * ship the walker is on. Y starts at `$04AC,X`, which is 0 for the FLOOR walker
 * (entry 7 never writes it) and 1 for the CEILING walker (`$B774 LDA #$01`),
 * and gains 2 when the walker is to the LEFT of the ship.
 *
 * W21's tablecoverage.py settled which of entry 7/19's three tables is which,
 * and the distinction is load-bearing here: `$B6D2` is the RANK row
 * (-> $04EC/$040C, above), **`$B6D9` is a METASPRITE table** (`1C 1C 1F 1F`,
 * -> $012C) and `$B6DD` is the bulletMuzzle index (`01 03 02 04`, -> $0496).
 */
function walkerFrame(state, rom, j) {
  const o = state.obj; const i = j + ENEMY_BASE;
  let y = o.s04A0[i];                    // $B6B8 LDY $04AC,X
  // $B6BB LDA $036C,X / CMP $0360 / BCS $B6C5 -- the walker is LEFT of the ship
  if (o.x[i] < o.x[0]) y = u8(y + 2);    // $B6C3 INY / INY
  o.anim[i] = rom.read(0xB6D9 + y);      // $B6C5 LDA $B6D9,Y / STA $012C,X
  o.s0480[22 + j] = rom.read(0xB6DD + y);  // $B6CB LDA $B6DD,Y / $B6CE STA $0496,X
                                         //   -- the j-INDEXED array again, the
                                         //   one $BC90 reads when it fires.
}

/** `$B70B` -- `LDX $A8 / JMP $B17C`: reload the slot index, then Y += A. */
function walkerStepY(state, a) {
  addAY(state, state.spawn.zA8, a);      // $B70B LDX $A8 / $B70D JMP $B17C
}

/**
 * `$B723` -- the tail BOTH walkers run on their ODD phases ($046C bit 0 set),
 * and the reason entry 19 is only 45 bytes long: `$B753 BNE $B723`.
 *
 * It drifts with the camera ($AEDD), redraws, and counts $04CC up to $3C = 60
 * frames per phase. At phase 7 it clears the docking column instead of
 * re-picking it -- `$B741 LDA #$00 / STA $048C,X` -- which sends the next
 * $B676 down the `col < $048C` = false path forever, i.e. the walker leaves.
 */
function walkerTail(state, rom, j) {
  const o = state.obj; const i = j + ENEMY_BASE;
  h_AEDD(state);                         // $B723 JSR $AEDD
  walkerFrame(state, rom, j);            // $B726 JSR $B6B8
  o.s04C0[i] = u8(o.s04C0[i] + 1);       // $B729 INC $04CC,X
  if (o.s04C0[i] < 0x3C) return;         // $B72C CMP #$3C / BCS $B734 / $B733 RTS
  o.s0460[i] = u8(o.s0460[i] + 1);       // $B734 INC $046C,X
  if (o.s0460[i] < 0x07) {               // $B737 CMP #$07 / BCS $B741
    return walkerDockColumn(state, j);   // $B73E JMP $B65C
  }
  o.s0480[i] = 0;                        // $B741 LDA #$00 / $B743 STA $048C,X
}

/**
 * Handler 7, `$B6E1` -- THE FLOOR-HUGGING TERRAIN WALKER, types $07/$87. THE
 * FIRST FAILURE IN THE GAME: stage 0, chunk 2 ($A87A), trigger $20, cmd $03,
 * at scroll $0440, and MEASURED on the cartridge at game frame 2490 with 4995
 * executions across three 6000-frame runs (tools/oracle/throwaudit.py, wave 12).
 * 35 wave spawns across the whole game.
 *
 * On EVEN phases it probes the collision map twice through the already-ported
 * `$C3D3` (src/terrain.js probeCollision) and rides the ground:
 *
 *   ground at y+8 but NOT at y+5  ->  level: no Y change at all
 *   nothing  at y+8               ->  `$B707 LDA #$03`, fall 3 px
 *   ground   at y+5               ->  `$B71B LDA #$FD`, climb 3 px
 *
 * and then docks. On ODD phases it runs $B723 instead. `$046C` is therefore
 * both the phase counter AND the walk/dwell selector.
 *
 * THE TWO PROBES SHARE $A4/$A5 AND THE SECOND IS THREE DECs OF THE FIRST --
 * `$B710 DEC $A5` x3 -- so the second probe is at y+8-3 = y+5, NOT at y-3+8 as
 * 20-recon-enemy-census.md's summary line reads. The listing is the authority.
 */
function h_B6E1(state, rom, j) {
  const o = state.obj; const i = j + ENEMY_BASE;
  j = state.spawn.zA8;                   // $B6E1 LDX $A8 -- reloads X
  if (!(o.type[i] & 0x80)) {             // $B6E3 LDA $030C,X / $B6E6 BMI $B6EE
    walkerDockColumn(state, j);          // $B6E8 JSR $B65C
    return setInitialised(state, j);     // $B6EB JMP $B0B4 -- a JMP, not a fall
  }
  if (o.s0460[i] & 1) return walkerTail(state, rom, j);   // $B6EE/$B6F3 BNE $B723
  const px = o.x[i];                     // $B6F5 LDA $036C,X / STA $A4
  const py = u8(o.y[i] + 8);             // $B6FA LDA $032C,X / CLC / ADC #$08
  if (probeCollision(state, px, py) === 0) {   // $B702 JSR $C3D3 / $B705 BNE $B710
    walkerStepY(state, 0x03);            // $B707 LDA #$03 / BNE $B71D -> $B70B
  } else if (probeCollision(state, px, u8(py - 3)) !== 0) {  // $B710-$B719
    walkerStepY(state, 0xFD);            // $B71B LDA #$FD / $B71D JSR $B70B
  }
  walkerDock(state, rom, j);             // $B720 JMP $B676
}

/**
 * Handler 19, `$B747` -- THE CEILING-HUGGING WALKER, types $13/$93. 44 wave
 * spawns; MEASURED first at game frame 2498, eight frames after entry 7, and
 * the sweep recon calls it the BIGGEST wall of the five (46 powered windows,
 * more than $B6E1's 25-34).
 *
 * It is entry 7 with the Y sign flipped and the branch targets shared: the
 * probes are at y-8 and y-5, `$B765 BEQ $B71B` and `$B772 BNE $B707` reuse
 * entry 7's OWN two constants, and `$B753 BNE $B723` reuses its tail. The init
 * is the one part that is genuinely different: `$04AC = 1` (which shifts
 * $B6B8's metasprite/muzzle lookup by one) and `$018C |= $80`, the vertical
 * flip that makes it hang from the ceiling.
 */
function h_B747(state, rom, j) {
  const o = state.obj; const i = j + ENEMY_BASE;
  j = state.spawn.zA8;                   // $B747 LDX $A8
  if (!(o.type[i] & 0x80)) {             // $B749 LDA $030C,X / $B74C BPL $B774
    o.s04A0[i] = 1;                      // $B774 LDA #$01 / STA $04AC,X
    o.attrMask[i] = o.attrMask[i] | 0x80;  // $B779 LDA $018C,X / ORA #$80 / STA
    walkerDockColumn(state, j);          // $B781 JSR $B65C
    return setInitialised(state, j);     // $B784 JMP $B0B4
  }
  if (o.s0460[i] & 1) return walkerTail(state, rom, j);   // $B74E/$B753 BNE $B723
  const px = o.x[i];                     // $B755 LDA $036C,X / STA $A4
  const py = u8(o.y[i] - 8);             // $B75A LDA $032C,X / SEC / SBC #$08
  if (probeCollision(state, px, py) === 0) {   // $B762 JSR $C3D3 / $B765 BEQ $B71B
    walkerStepY(state, 0xFD);            // $B71B LDA #$FD -- climb toward the roof
  } else if (probeCollision(state, px, u8(py + 3)) !== 0) {  // $B767-$B772
    walkerStepY(state, 0x03);            // $B707 LDA #$03 -- back down
  }
  walkerDock(state, rom, j);             // $B720 JMP $B676
}

/**
 * `$AF33` -- the hatch INIT, shared by entries 15 and 16 (`$AF8B BPL $AF33`).
 *
 * Three of its four stores are load-bearing outside this file:
 *   `$0460,X` = 1 is the j-INDEXED array, the HITBOX CLASS `$C020 LDX $0460,Y`
 *               and `$C11C` read -- so a hatch has a taller box than a squadron
 *               member, which is class 0.
 *   `$048C,X` = 1 is what GATES ARMOUR DAMAGE at `$C070 LDA $048C,Y / BEQ`.
 *               Without it the hatch is invulnerable.
 *   `$010C,X` = $80 makes it armoured: `$ADE8 BMI $AE14` skips the $ADC1
 *               animator, and `$C05D BPL $C090` sends every hit down the
 *               damage-accumulator arm instead of the kill.
 */
function hatchInit(state, j) {
  const o = state.obj; const i = j + ENEMY_BASE;
  o.s0460[j] = 1;                        // $AF33 LDA #$01 / $AF35 STA $0460,X
  o.s0480[i] = 1;                        // $AF38 STA $048C,X
  o.status[i] = 0x80;                    // $AF3B LDA #$80 / $AF3D STA $010C,X
  setInitialised(state, j);              // $AF40 JMP $B0B4
}

/**
 * `$AF98` -- THE PARAMETERISED SPAWNER, and a first-class spawn site: it is the
 * ONLY writer of enemy types `$09` and `$0C` in the whole 32 KB (via `$AFE0 STA
 * $030C,X`; the census enumerated every absolute store into $0300-$031F). That
 * is why entries 9 and 12 appear in no wave list anywhere and are still
 * required by stage 1.
 *
 * The gate is three-stage and lives in `$042C,X` (the same byte $AE99 uses as
 * an explosion-script cursor -- different type, different meaning):
 *   phase 0  spawn only once the hatch's X has reached $C8
 *   phase 1  ... $A0
 *   phase 2+ `$AFA8 RTS`, never again
 * plus `$02 AND $0F == 0` (one frame in 16) and a per-phase count of FIVE in
 * `$044C,X`; the fifth attempt rolls the phase instead of spawning.
 *
 * The allocation is the ordinary DEX/BPL scan (`allocEnemySlot(true)`), and a
 * FAILURE IS GAMEPLAY: `$AFD2` restores $A8 and returns having consumed the
 * `$044C` increment. The child is not deferred.
 */
function hatchSpawn(state, rom, j, yOff, childType) {
  const o = state.obj; const sp = state.spawn; const i = j + ENEMY_BASE;
  const parent = sp.zA8;                 // $AF9A LDX $A8 / $AF9C STX $AB
  const phase = o.xvel[i];               // $AFA0 LDY $042C,X
  if (phase === 0) {                     // $AFA3 BEQ $AFB1
    if (o.x[i] < 0xC8) return;           // $AFB1 CMP #$C8 / $AFB6 BCC $AFB0 RTS
  } else if (phase === 1) {              // $AFA5 DEY / $AFA6 BEQ $AFA9
    if (o.x[i] < 0xA0) return;           // $AFA9 CMP #$A0 / $AFAE BCS $AFB8
  } else {
    return;                              // $AFA8 RTS
  }
  if ((state.frame & 0x0F) !== 0) return;   // $AFB8 LDA $02 / AND #$0F / BNE $B01C
  o.xvelf[i] = u8(o.xvelf[i] + 1);       // $AFBE INC $044C,X
  if (o.xvelf[i] >= 5) {                 // $AFC1 CMP #$05 / $AFC6 BCS $B014
    o.xvelf[i] = 0;                      // $B014 LDA #$00 / $B016 STA $044C,X
    o.xvel[i] = u8(o.xvel[i] + 1);       // $B019 INC $042C,X
    return;                              // $B01C RTS
  }
  const n = allocEnemySlot(state, true); // $AFC8-$AFD0 LDX #$09 / BEQ / DEX / BPL
  if (n < 0) { sp.zA8 = parent; return; }   // $AFD2 LDX $AB / STX $A8 / RTS
  sp.zA8 = n;                            // $AFD7 STX $A8
  clearSlot(state, n);                   // $AFD9 JSR $A527
  const ni = n + ENEMY_BASE;
  o.type[ni] = childType;                // $AFDE LDA $AA / $AFE0 STA $030C,X
  o.status[ni] = 0;                      // $AFE3 LDA #$00 / $AFE5 STA $010C,X
  o.x[ni] = u8(o.x[i] + 8);              // $AFEA LDA $036C,Y / ADC #$08 / STA
  o.y[ni] = u8(o.y[i] + yOff);           // $AFF3 LDA $032C,Y / ADC $AC / STA
  // $AFFC LDY $17 / $AFFE LDA $19 BEQ INY / $B003 LDA $1A BEQ INY -- the rank
  // row is shifted by the STAGE and by the LOOP, so the same hatch fires faster
  // on stage 2+ and faster again on loop 2. $1A is structurally 0 in this port.
  let y = state.zp17;
  if (state.zp19 !== 0) y = u8(y + 1);   // $B002 INY
  if (state.zp1A !== 0) y = u8(y + 1);   // $B007 INY
  const iv = rom.read(0xB01D + y);       // $B008 LDA $B01D,Y
  o.s04E0[ni] = iv;                      // $B00B STA $04EC,X   fire RELOAD
  o.style[ni] = iv;                      // $B00E STA $040C,X   fire COUNTDOWN
  sp.zA8 = parent;                       // $B011 JMP $AFD2
}

/**
 * Handler 15, `$AF2E` -- THE FLOOR HATCH, types $0F/$8F. 14 wave spawns;
 * MEASURED first at game frame 2778, on a run carrying power-ups.
 *
 * Every frame it calls $AF98 (Y = $08, A = $09 -> a type-$09 child 8 px BELOW
 * it), draws metasprite $78 ($63 on stage 5 only), and reads its own damage
 * counter `$046C`: >= 3 turns the palette bits on, >= 5 destroys it.
 *
 * THE DESTROYED ARM IS THE WARP ROUTE and it is why `$5F` and `$39` became port
 * state in this wave (src/state.js). On stage 0 ONLY, with the score byte
 * `$07E5 + 4*$18` EVEN, it bumps `$5F`, and at `$5F >= 4` it does `INC $39` --
 * the flag `$9937` reads to skip stage 2. The parity gate is `$AF73 LSR A /
 * BCS`, i.e. bit 0 of the score's middle byte; W27 owns the reader.
 */
function h_AF2E(state, rom, j) {
  const o = state.obj; const i = j + ENEMY_BASE;
  if (!(o.type[i] & 0x80)) return hatchInit(state, j);   // $AF2E/$AF31 BMI $AF43
  hatchSpawn(state, rom, j, 0x08, 0x09); // $AF43 LDY #$08 / LDA #$09 / JSR $AF98
  let ms = 0x78;                         // $AF4A LDA #$78
  if (state.zp19 === 5) ms = 0x63;       // $AF4C LDY $19 / CPY #$05 / $AF52 LDA #$63
  hatchBody(state, j, ms);               // $AF54
}

/**
 * Handler 16, `$AF88` -- THE CEILING HATCH, types $10/$90. 8 wave spawns;
 * MEASURED first at game frame 5018. It is entry 15 re-entered twice: `$AF8B
 * BPL $AF33` for the init and `$AF96 BNE $AF54` for the body. Only the child's
 * Y offset ($F6 = -10), the child's type ($0C) and the metasprite ($79) differ,
 * and the stage-5 metasprite swap is NOT reachable from here -- $AF94 loads $79
 * and branches PAST $AF4A.
 */
function h_AF88(state, rom, j) {
  const o = state.obj; const i = j + ENEMY_BASE;
  if (!(o.type[i] & 0x80)) return hatchInit(state, j);   // $AF88/$AF8B BPL $AF33
  hatchSpawn(state, rom, j, 0xF6, 0x0C); // $AF8D LDY #$F6 / LDA #$0C / JSR $AF98
  hatchBody(state, j, 0x79);             // $AF94 LDA #$79 / $AF96 BNE $AF54
}

/** `$AF54`-`$AF87` -- the body both hatches share, entered with A = metasprite. */
function hatchBody(state, j, ms) {
  const o = state.obj; const i = j + ENEMY_BASE;
  o.anim[i] = ms;                        // $AF54 STA $012C,X
  const dmg = o.s0460[i];                // $AF57 LDY $046C,X
  if (dmg >= 3) o.attrMask[i] = 3;       // $AF5A CPY #$03 / BCC $AF63 / $AF5E-$AF60
  if (dmg < 5) return h_AEDD(state);     // $AF63 CPY #$05 / $AF65 BCC $AF2B -> $AEDD
  // ---- DESTROYED ---------------------------------------------------------
  if (state.zp19 === 0) {                // $AF67 LDA $19 / $AF69 BNE $AF80
    // $AF6B LDA $18 / ASL / ASL / TAY / $AF70 LDA $07E5,Y -- the 4-byte stride
    // $8474 uses, so this is the CURRENT player's score middle byte.
    const digit = state.score[5 + 4 * state.zp.player];
    if ((digit & 1) === 0) {             // $AF73 LSR A / $AF74 BCS $AF80
      state.zp5F = u8(state.zp5F + 1);   // $AF76 INC $5F
      if (state.zp5F >= 4) {             // $AF78 LDA $5F / CMP #$04 / BCC $AF80
        state.zp39 = u8(state.zp39 + 1); // $AF7E INC $39 -- THE WARP FLAG
      }
    }
  }
  soundRequest(state, 0x0A);             // $AF80 LDA #$0A / $AF82 JSR $CB28 -> $EC1E
  explodeInPlace(state, j);              // $CB2B
  addScore(state, 0x00, 0x01, 0x00);     // $AF85 JMP $8453 -> $9A = 1, $99/$9B = 0
}

/**
 * `$CB2B` -- turn this slot into an explosion WITHOUT going through `$BE93`.
 * `$CB28` is `JSR $EC1E` (the sound) and then falls straight into it, so the
 * hatch's death plays explosion script 2 and drops NO capsule ($03AC cleared).
 * `$CB2B` is also reached from $CB69 (the $0600-page object, unported).
 */
function explodeInPlace(state, j) {
  const o = state.obj; const i = j + ENEMY_BASE;
  o.xvel[i] = 0;                         // $CB2D STA $042C,X  the script cursor
  o.timer[i] = 0;                        // $CB30 STA $014C,X
  o.attrMask[i] = 0;                     // $CB33 STA $018C,X
  o.s0460[i] = 0;                        // $CB36 STA $046C,X
  o.s04A0[i] = 0;                        // $CB39 STA $04AC,X
  o.status[i] = 0;                       // $CB3C STA $010C,X
  o.carrier[i] = 0;                      // $CB3F STA $03AC,X  -- no capsule
  o.style[i] = 0;                        // $CB42 STA $040C,X
  o.type[i] = 2;                         // $CB45 LDA #$02 / $CB47 STA $030C,X
  o.animFrame[i] = 2;                    // $CB4A STA $016C,X  explosion script 2
}

/**
 * `$B31E` -- the 8-frame flip animation both hatch children run, EVERY frame
 * including the first: `INC $014C,X / LSR / LSR / AND #$07`, so the frame
 * changes every 4 game frames and the palette-OR byte `$018C` is $80 for
 * frames 4-7. Table `$B33B` = `5E 5F 60 61 62 61 60 5F`.
 */
function flipAnim(state, rom, j) {
  const o = state.obj; const i = j + ENEMY_BASE;
  o.timer[i] = u8(o.timer[i] + 1);       // $B31E INC $014C,X
  const y = (o.timer[i] >> 2) & 0x07;    // $B321-$B326 LSR / LSR / AND #$07
  o.attrMask[i] = y >= 4 ? 0x80 : 0x00;  // $B329-$B331 CPY #$04 / BCC / LDA #$80
  o.anim[i] = rom.read(0xB33B + y);      // $B334 LDA $B33B,Y / $B337 STA $012C,X
}

/** `$B367` -- give up on the climb/dive and go ballistic LEFT at 2 px/frame. */
function childBallistic(state, j) {
  const o = state.obj; const i = j + ENEMY_BASE;
  o.s0480[i] = 1;                        // $B367 LDA #$01 / $B369 STA $048C,X
  addAX(state, j, 0xFE);                 // $B36C JMP $B2DB -> LDA #$FE / $B103
  offScreenCheck(state);                 // $B106 JMP $B251
}

/** `$B3F9` -- Y += A, then handler 1's freeze check and 0.5 px/frame drift. */
function childStepY(state, j, a) {
  addAY(state, j, a);                    // $B3F9 JSR $B17C
  h_AEDD(state);                         // $B3FC JMP $AEDD
}

/**
 * Handler 9, `$B311` -- THE FLOOR HATCH'S CHILD, types $09/$89. It appears in
 * NO wave list in the game; `$AF98` is its only producer. MEASURED first at
 * game frame 2783.
 *
 * `$04CC` is a 10-frame launch delay, `$04AC` latches "the delay is spent", and
 * `$048C` latches "I have gone ballistic". Until then it climbs 2 px/frame
 * (`$B362 LDA #$FE`) and stops climbing the moment the PLAYER's Y is at or
 * below its own -- `$B35A LDA $0320 / CMP $032C,X / BCS $B367`.
 */
function h_B311(state, rom, j) {
  const o = state.obj; const i = j + ENEMY_BASE;
  if (!(o.type[i] & 0x80)) {             // $B311 LDA $030C,X / $B314 BMI $B343
    o.s04C0[i] = 0x0A;                   // $B316 LDA #$0A / $B318 STA $04CC,X
    return setInitialised(state, j);     // $B31B JMP $B0B4 -- $048C NOT cleared
  }
  flipAnim(state, rom, j);               // $B343 JSR $B31E
  if (o.s04A0[i] === 0) {                // $B346 LDA $04AC,X / $B349 BNE $B355
    o.s04C0[i] = u8(o.s04C0[i] - 1);     // $B34B DEC $04CC,X
    if (o.s04C0[i] !== 0) return childStepY(state, j, 0xFE);   // $B34E BNE $B362
    o.s04A0[i] = 1;                      // $B350 LDA #$01 / $B352 STA $04AC,X
  }
  if (o.s0480[i] !== 0) return childBallistic(state, j);   // $B355/$B358 BNE $B367
  // $B35A LDA $0320 / $B35D CMP $032C,X / $B360 BCS $B367
  if (o.y[0] >= o.y[i]) return childBallistic(state, j);
  childStepY(state, j, 0xFE);            // $B362 LDA #$FE / JMP $B3F9
}

/**
 * Handler 12, `$B3CB` -- THE CEILING HATCH'S CHILD, types $0C/$8C. Entry 9 with
 * the Y sign flipped, a 20-frame delay instead of 10, and the comparison the
 * other way round (`$B3EF LDA $032C,X / CMP $0320 / BCS $B3FF` -- ITS OWN Y
 * against the player's, not the player's against its own; the operands really
 * are swapped between the two, not just the branch).
 *
 * ITS INIT IS NOT ENTRY 9'S. `$B3D5 JMP $B3A2` clears `$048C` and then FALLS
 * THROUGH into `$B3A7 JMP $B0B4`; entry 9's `$B316` arm does not clear it.
 */
function h_B3CB(state, rom, j) {
  const o = state.obj; const i = j + ENEMY_BASE;
  if (!(o.type[i] & 0x80)) {             // $B3CB LDA $030C,X / $B3CE BMI $B3D8
    o.s04C0[i] = 0x14;                   // $B3D0 LDA #$14 / $B3D2 STA $04CC,X
    o.s0480[i] = 0;                      // $B3D5 JMP $B3A2 -> LDA #$00 / STA $048C,X
    return setInitialised(state, j);     // FALL-THROUGH into $B3A7 JMP $B0B4
  }
  flipAnim(state, rom, j);               // $B3D8 JSR $B31E
  if (o.s04A0[i] === 0) {                // $B3DB LDA $04AC,X / $B3DE BNE $B3EA
    o.s04C0[i] = u8(o.s04C0[i] - 1);     // $B3E0 DEC $04CC,X
    if (o.s04C0[i] !== 0) return childStepY(state, j, 0x02);   // $B3E3 BNE $B3F7
    o.s04A0[i] = 1;                      // $B3E5 LDA #$01 / $B3E7 STA $04AC,X
  }
  if (o.s0480[i] !== 0) return childBallistic(state, j);   // $B3EA/$B3ED BNE $B3FF
  // $B3EF LDA $032C,X / $B3F2 CMP $0320 / $B3F5 BCS $B3FF
  if (o.y[i] >= o.y[0]) return childBallistic(state, j);
  childStepY(state, j, 0x02);            // $B3F7 LDA #$02 / $B3F9
}
