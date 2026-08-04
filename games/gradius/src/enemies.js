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
//   $C413                    the LATE SPAWNER -- the per-stage eruption that
//                            runs DURING W24's $82 countdown (the 768-frame
//                            volcano). Reached two ways: $3A != 0 at $A2C4
//                            (the stage-advance latch, measured 0 on all 27,400
//                            of those frames) and $1B = $82 at $A2FB (the LIVE
//                            stage-1 path). Stage 1's arm $C486 spawns type $0A
//                            (zero wave records, $C486 its only producer).
//                            PORTED WAVE 25; the other 6 arms (stages 2-7)
//                            throw loudly by stage scope.
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

import { u8, u16, ENEMY_BASE, ENEMY_SLOTS, ARM_POOL, ARM_BASES } from './state.js';
import { soundRequest } from './sound.js';
import { probeCollision } from './terrain.js';
import { addScore } from './score.js';
import { queueByte } from './vram.js';

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
  // $A2D1 LDA $19: the wave/chunk tables are indexed by the LIVE stage counter
  // $19, not the loaded-stage index. They match while one stage is loaded
  // (stage 1: $19 == 0 == res.stage.stage); after W27's $96CF advances $19 to
  // 1, the engine reads stage 2's wave data out of ROM ($A7D0 + 2*$19), which
  // is present for all stages. The stage-specific TERRAIN tables (res.stage)
  // are a different matter -- see streamBlock's $19 guard in terrain.js.
  const stageIndex = state.zp19;                       // $A2D1 LDA $19
  if (state.build.gate !== 0) {        // $A2C0 LDA $3A / BEQ $A2C7
    lateSpawner(state, rom, stageIndex);  // $A2C4 JMP $C413 (the late spawner)
    return;
  }
  if (sp.z60 === 0) return;            // $A2C7 LDX $60 / BNE / $A2CB RTS
  if (u8(sp.z60 - 1) !== 0) {          // $A2CC DEX / $A2CD BNE $A2F0
    runEngine(state, rom, stageIndex, res);
    return;
  }
  sp.z60 = u8(sp.z60 + 1);             // $A2CF INC $60 -- ONLY on this entry;
  loadChunk(state, rom, stageIndex);  //  the $A308 reload path skips it
}

/** `$A2F0` -- the running state. */
function runEngine(state, rom, stageIndex, res) {
  const sp = state.spawn;
  if (state.substate === 0x81) return;   // $A2F0 CMP #$81 / $A2F6 RTS
  if (state.substate === 0x82) {         // $A2F7 CMP #$82
    lateSpawner(state, rom, stageIndex); // $A2FB JMP $C413 (the late spawner)
    return;
  }
  // Stage 5+ WAVE content is OUT OF SCOPE. The $82 late-spawner arm above still
  // runs (its own per-stage throws cover stages 5+). This guard fires on the
  // first stage-5 wave RECORD -- the expected boundary after stage 4's content
  // + boss + the stage-4->stage-5 transition.
  //
  // W30 lowered it from `>= 2` to `>= 3`; W31 lowers it to `>= 4`. THIS GUARD
  // IS INVISIBLE TO stageledger.py -- the ledger reports type->handler coverage
  // and read 98/98 for stage $19=3 for a whole wave while this line still threw
  // on stage 4's first record. What made stage 4 reachable is $C5AD (the
  // ceiling volcano) + $B377 (its rock); its 98 wave records came free with
  // W30's $B402/$B434.
  //
  // W32a PORTED $B559 (entry 29) and W32b PORTED THE WHOLE $0600 ARM POOL, so
  // stageledger.py reads `stage 4: 28/28, first unported NONE`. W32a refused to
  // lower this guard and so did W32b, both for the same measured reason: the
  // guard is the LAST of the stage-5 walls, not the first, and admitting the
  // stage while an ORDINARY play path still threw would make the runnability
  // column print RUNNABLE for a stage that cannot survive one player shot --
  // the exact lie W31 built that column to kill.
  //
  // W32c LOWERS IT TO `>= 5`, and here is the evidence, not the intention.
  // Every `$19 == 4` site in the PRG is now live. There are SIX and W32a's
  // list had five; the sixth was found by scanning assets/prg.bin for
  // `A5 19 C9 04` this wave rather than by trusting the list:
  //
  //   $8B8D -> $8BD9   the segment sprite pass                       W32b
  //   $9663            the $5C census + the half-rate frame fork     W32b
  //   $A17C            the MISSILE's terrain-probe bypass            W32c  <--
  //   $C037 -> $BEF3   a shot against an arm segment                 W32c
  //   $C25D -> $C267   the player's body against the segments        W32b
  //   $C772 -> $CB8A   the per-frame arm driver                      W32b
  //
  // plus `$CB91 -> $CBD1` (an arm firing), which is not gated on $19 at all --
  // it sits INSIDE the driver and was the one half-ported gap behind working
  // code. All eight are ported. `$A17C` is the one that matters for the
  // decision: it fires whenever a MISSILE is alive, i.e. for any player who
  // took the second power-up, and neither W32a's five-wall list nor W32b's
  // worklog named it.
  //
  // MEASURED before lowering (tests/w32c-interactions.test.js, the last two
  // checks): 600 consecutive stagePlay frames on stage 5 with two live arm
  // groups, an owner, missiles in flight and the player holding fire -- both
  // frame parities, 300 forked frames, arms fired, arms destroyed, the owner's
  // arm count decremented, and 0 throws. The same fixture on the previous
  // commit throws inside the first ten frames.
  if (stageIndex >= 5) {
    throw new Error(`$A2F0 runEngine: $19 = $${stageIndex.toString(16).toUpperCase()}`
                  + ` (stage ${stageIndex + 1}). Stage 5 ($19=4) is shipped`
                  + ` (W32a entry 29, W32b the $0600 ARM pool + the half-rate`
                  + ` frame fork, W32c $BEF3/$CBD1/$A17C). Stage 6 ($19=5) has`
                  + ` 47 of its 98 distinct wave records ported -- run`
                  + ` tools/oracle/stageledger.py for the first unported one --`
                  + ` and its late spawner $C6DE also throws.`);
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

// ====================== THE LATE SPAWNER, $C413 ==============================
//
// $C413 is the per-stage LATE SPAWNER -- the second enemy spawner that runs
// DURING W24's $82 countdown (the 768-frame eruption at $99E9). It was
// mislabelled "stage advance" in this port for the same reason the census
// mis-read its table as 11 entries: its $3A-gated entry at $A2C4 looked like
// the stage-advance latch, and the table at jt_$C439 abuts the pointer data
// $C447. The LIVE stage-1 entry is the $1B == $82 arm at $A2FB (runEngine
// above), and what it spawns is the volcano: type $0A, which has ZERO
// wave-script records anywhere and $C486 as its only producer.
//
// TWO entry points converge here, both JMPs out of the spawn engine:
//   $A2C4 JMP $C413  when $3A != 0 (the stage-advance latch; measured 0 on
//                    every frame of every stage-1 run; reaches the same body
//                    but via the gate at the top of spawnEngine)
//   $A2FB JMP $C413  when $1B == $82 (the countdown -- the live stage-1 path;
//                    reached from runEngine above)
//
// THE DENOMINATOR (tools/oracle/out/throwaudit-endchain.json, the 6000-frame
// cartridge run that cleared stage 1):
//   $C413 executes 768 times (== the $82 duration, game frames 1339-2107).
//   The $02 & 3 gate at $C415 passes 1 in 4 -> 192 spawn-frames.
//   Handler entry 10 ($B36F, type $0A) executes 6,365 times over the run.
//   The 32-byte pattern stream yields 64 spawns/cycle -> 192 = exactly 3 cycles.

/**
 * `$C413` -- the late spawner entry. Fires every 4th frame, finds an empty
 * enemy slot, clears it, then dispatches on the stage to one of 7 arms.
 *
 * Stage 1's arm is `$C486` (the volcano); the other 6 arms throw loudly by
 * stage scope. `$C429` (stage 7) is the bare RTS -- no spawn -- and is the
 * one arm that returns without throwing.
 */
function lateSpawner(state, rom, stageIndex) {
  // $C413 LDA $02 / AND #$03 / BEQ $C41A -- only spawn every 4th frame.
  // $02 is the free-running frame counter, kept 8-bit in state.frame.
  if ((state.frame & 0x03) !== 0) return;   // $C417 F0 01 / $C419 60 RTS
  // $C41A LDX #$09 / $C41C STX $A8 / $C41E-C427: scan slots 9..0 for an empty
  // one (BPL, so it tests slot 0). allocEnemySlot(state, true) is that scan.
  const j = allocEnemySlot(state, true);     // $C41E LDX $A8 / LDA $030C,X / BEQ
  if (j < 0) return;                         // $C429 60 RTS -- no empty slot
  state.spawn.zA8 = j;                       // $C41C STX $A8 (the cursor)
  clearSlot(state, j);                       // $C42A JSR $A527
  // $C42D LDA $3A / BEQ $C434 -- the warp gate. $3A != 0 -> $C686 (the warp
  // rain). Checked a SECOND time (the first was spawnEngine's $A2C0 gate that
  // routed here). Reached only on the $39 warp route (W27); stage-1 normal play
  // has $3A == 0.
  if (state.build.gate !== 0) {
    return st_C686(state, rom);                       // $C42D/$C686
  }
  // $C434 LDA $19 / JSR $83E4 -- jt_$C439, a 7-entry inline dispatch on stage.
  const target = rom.word(0xC439 + 2 * stageIndex);   // jt_$C439[stage]
  switch (target) {
    case 0xC486: return st_C486(state, rom);   // stage 1 -- the volcano
    // ---- stages 2-7: stage-2 shipped (W29); stages 3-7 still LOUD THROWS ----
    // Each carries its ROM target and what it spawns, so the wave that ports it
    // has the address and the producer in the message.
    case 0xC546: return st_C546(state, rom);   // stage 2 -- the jellyfish
    // Stage 3's arm IS the warp-rain routine, with $3A = 0 instead of 1 (we are
    // on the $C434 dispatch, which is only reached when $3A == 0). The tables it
    // indexes by $3A therefore give it a DIFFERENT enemy: $C684[0] = $28 (spawn
    // every 40th late-spawner call, i.e. every 160 frames, against $0A/40 frames
    // for the rain), $C6CA[0] = $3F (anim) and $C6CC[0] = $97 -> $B7A1. One
    // shared body, two stages -- exactly what W27's port already transcribed;
    // W30's fix is this label. (28-recon-stages-2-7.md 3c called it "a one-line
    // wiring fix once $B7A1 lands", and it is.)
    case 0xC686: return st_C686(state, rom);   // stage 3 -- the $B7A1 mover
    // Stage 4's arm is the CEILING volcano: the same eruption as stage 1's
    // $C486 with the crater on the roof (Y $2C, not $90) and type $15 -> entry
    // 21 -> $B377, whose arc adds Y where the stage-1 rock's subtracts it.
    case 0xC5AD: return st_C5AD(state, rom);   // stage 4 -- the ceiling volcano
    // Stage 5's arm reads one of four $C67A rows every $28 calls and hands it
    // to $A4A6, the ARM-GROUP allocator. W32b.
    case 0xC653: return st_C653(state, rom);   // stage 5 -- the arm owner
    case 0xC6DE:
      throw new Error('$C439[5] -> $C6DE: stage-6 late-spawner arm not ported '
                    + '(stage-1 scope, W25).');
    case 0xC429:
      return;   // $C429 60 RTS -- stage 7's arm is the bare RTS (no spawn)
    default:
      throw new Error(`jt_$C439[${stageIndex}] -> ${hex4(target)}: unrecognised `
                    + 'late-spawner arm (the 7-entry table is $C439-$C446, '
                    + 'proven by $C447 abutting sub_$C44F\'s pointer data)');
  }
}

/**
 * `$C686` -- the WARP RAIN. Reached from the late spawner's `$3A` gate during
 * the `$39` warp route (and as jt_$C439[2], the stage-3 arm, out of scope).
 * Throttled by the count `$68` against `$C684[$3A]`; each spawn reuses the slot
 * the late spawner just cleared (`$A8`), places a type-$A6 drop at X `$F0` and a
 * Y from `$C6CE[$69 & $0F]`, and steps `$69`. Rain stops once cam.hi reaches $0E.
 *
 *   C686  INC $68 / LDA $68 / LDY $3A / CMP $C684,Y / BCS $C692 / RTS  count gate
 *   C692  LDA $3F / CMP #$0E / BCC $C699 / RTS                        stop at $0E
 *   C699  LDA #$00 / STA $68           reset count
 *   C69D  LDX $A8                      the cleared slot
 *   C69F  LDA $69 / INC $69 / AND #$0F / TAY    Y = ($69++) & $0F
 *   C6A6  LDA $C6CE,Y / STA $032C,X    Y position
 *   C6AC  LDA #$01 / STA $0460,X       flag (arms the missile-damage path $C079)
 *   C6B1  LDY $3A / LDA $C6CA,Y / STA $012C,X   anim/metasprite
 *   C6B9  LDA $C6CC,Y / STA $030C,X    type ($A6 for $3A = 1)
 *   C6BF  LDA #$80 / STA $010C,X       status
 *   C6C4  LDA #$F0 / STA $036C,X       X position
 *   C6C9  RTS
 *
 * `$3A = 1` on the warp (one INC at $993D): `$C6CA[1] = $00` (anim),
 * `$C6CC[1] = $A6` (type), `$C684[1] = $0A` (spawn every 10th late-spawner
 * call = every 40 frames). `$69` is shared with the wave engine's formation
 * counter; during the warp the wave engine is idle (the `$3A` gate reroutes it
 * here), so `$69` is the rain's own position stepper.
 */
function st_C686(state, rom) {
  const sp = state.spawn;
  sp.z68 = u8(sp.z68 + 1);                          // $C686 INC $68
  const gate = state.build.gate;                    // $C68A LDY $3A
  if (sp.z68 < rom.read(0xC684 + gate)) return;     // $C68C CMP $C684,Y / BCC RTS
  if (state.cam.hi >= 0x0E) return;                 // $C692 CMP #$0E / BCS RTS
  sp.z68 = 0;                                       // $C699 STA $68
  const i = sp.zA8 + ENEMY_BASE;                    // $C69D LDX $A8
  const y = sp.z69 & 0x0F;                          // $C69F/$C6A3 AND #$0F
  sp.z69 = u8(sp.z69 + 1);                          //         INC $69
  const o = state.obj;
  o.y[i] = rom.read(0xC6CE + y);                    // $C6A6 LDA $C6CE,Y / STA $032C,X
  // $C6AC STA $0460,X uses the RAW enemy index (X = $A8 = 0..9), NOT the +$0C
  // slot alias the other fields use -- the same $030B-style trap W26 warned of.
  // $0460+index is the per-handler-state slot 0..9 (peek maps it to s0460[idx]).
  o.s0460[sp.zA8] = 0x01;                            // $C6AC LDA #$01 / STA $0460,X
  o.anim[i] = rom.read(0xC6CA + gate);              // $C6B1 LDA $C6CA,Y / STA $012C,X
  o.type[i] = rom.read(0xC6CC + gate);              // $C6B9 LDA $C6CC,Y / STA $030C,X
  o.status[i] = 0x80;                               // $C6BF LDA #$80 / STA $010C,X
  o.x[i] = 0xF0;                                    // $C6C4 LDA #$F0 / STA $036C,X
}

/**
 * `sub_$C44F` -- the PATTERN STEPPER. Reads a packed-nibble spawn stream and
 * advances the spawn cursor `$69`, producing the position/velocity index `$A9`
 * and the odd/even flag `$AA` (which the caller uses to pick the crater and the
 * nibble).
 *
 * `x` selects which arm's stream pointer to read from `$C447+X` (X = 0 for the
 * volcano -> pointer at `$C447` -> stream `$C526`; 2 -> `$C58D`; 4 -> `$C633`).
 *
 * `$69` is a free-running counter shared with the wave engine's formation
 * countdown: it INCs every call, and wraps `$FF` -> `$7F` -> `$80` (so it never
 * naturally reaches 0 -- the eruption sfx at `st_$C486` plays only because the
 * wave engine's last formation left `$69` at 0 at the start of `$82`). Each
 * pattern byte's two nibbles are consumed on consecutive spawns -- the high
 * nibble when the POST-INC `$69` is even, the low when odd -- so the 32-byte
 * stream yields 64 spawns per cycle and the 192-spawn eruption walks it 3 times.
 *
 * Returns `{ a9, aa }` rather than modelling the transient `$9A`/`$9B`/`$A9`/
 * `$AA` zero-page bytes: `$9A`/`$9B` are scratch (written and read within this
 * one call) and `$A9`/`$AA` are consumed only by the caller (`st_$C486`).
 * The pre-INC `$69` indexes the stream; the POST-INC `$69` picks the nibble --
 * that split is the load-bearing subtlety and is preserved exactly.
 */
function sub_C44F(state, rom, x) {
  const sp = state.spawn;
  // $C44F-$C458: load the stream pointer from $C447+X into $9A:$9B. A 16-bit
  // CPU pointer; the block approachStage0 (W21) exports $C526+ raw for it.
  const ptr = rom.word(0xC447 + x);          // $C44F BD $C447,X / STA $9A/$9B
  // $C459-$C461: manage $69. LDA $69; CMP #$FF; if equal, reset to $7F.
  let cursor = sp.z69;                       // $C459 A5 69 LDA $69 (pre-INC value)
  if (cursor === 0xFF) {                     // $C45B C9 FF / $C45D D0 BNE
    cursor = 0x7F;                           // $C45F A9 7F / $C461 STA $69
  }
  // $C463 E6 69 -- $69 always increments, AFTER the possible $FF->$7F reset.
  sp.z69 = u8(cursor + 1);
  // $C465 AND #$3F / $C467 LSR A / $C468 TAY -- NOTE A still holds the PRE-INC
  // value (or $7F), so the stream index is (cursor & $3F) >> 1, range 0..31.
  const y = (cursor & 0x3F) >>> 1;
  // $C469 B1 9A / $C46B STA $A9 -- read one pattern byte from the stream.
  const patternByte = rom.read(ptr + y);
  // $C46D-$C471: $AA = (POST-INC $69) & 1 -- the nibble selector. sp.z69 is
  // the post-INC value (set at $C463).
  const aa = sp.z69 & 0x01;                  // $C46D A5 69 / AND #$01 / STA $AA
  // $C473-$C483: pick the high nibble (aa == 0) or the low nibble (aa != 0),
  // mask to 4 bits and double -> $A9 = nibble * 2 (the (xvel,yvel,accel) index).
  let nibble;
  if (aa !== 0) {                            // $C473 D0 09 BNE $C47E
    nibble = patternByte & 0x0F;             // $C47E LDA $A9 (the low nibble)
  } else {
    nibble = (patternByte >>> 4) & 0x0F;     // $C475 4x LSR A (high -> low)
  }
  const a9 = u8(nibble << 1);                // $C480 AND #$0F / $C482 ASL / STA $A9
  return { a9, aa };
}

/**
 * `st_$C486` -- stage 1's late-spawner arm: the VOLCANO. Spawns a type `$0A`
 * projectile at one of two craters (`$38` left, `$B8` right) with a parabolic
 * arc: constant X velocity, gravity on Y velocity (`velSubAccel` via the
 * `$B1E5` handler body). The ONLY producer of type `$0A` in the whole ROM.
 *
 * Cadence: the eruption fires every 4th frame for the 768-frame `$82` countdown
 * = 192 spawns. The pattern stream at `$C526` walks 64 spawns/cycle (high then
 * low nibble of each of 32 bytes), so the eruption repeats exactly 3 times.
 */
function st_C486(state, rom) {
  const sp = state.spawn;
  const o = state.obj;
  // $C486 LDY $69 / $C488 D0 05 BNE -- the eruption rumble sfx ($0F) plays only
  // when $69 == 0. That happens once, at the first spawn of the countdown,
  // because the wave engine's last formation counted $69 down to 0 before $82.
  if (sp.z69 === 0) {                        // $C488 D0 05
    soundRequest(state, 0x0F);               // $C48A LDA #$0F / $C48C JSR $EC1E
  }
  // $C48F LDX #$00 / $C491 JSR $C44F -- the pattern stepper, X=0 -> $C526.
  const { a9, aa } = sub_C44F(state, rom, 0x00);
  // $C494-$C49A: Y = a9 + (a9 >> 1) = 1.5*a9 -- the (xvel,yvel,accel) table
  // index, stepping in 3s through $C4F6/$C4F7/$C4F8.
  const y = u8((a9 >>> 1) + a9);             // $C496 LSR / CLC / ADC / TAY
  const j = sp.zA8;                          // $C49B LDX $A8
  const i = j + ENEMY_BASE;
  // $C49D-$C4A6: xvel ($042C,X) and yvel ($03BC,X) from the position tables.
  o.xvel[i] = rom.read(0xC4F6 + y);          // $C49D/$C4A0 STA $042C,X
  o.yvel[i] = rom.read(0xC4F7 + y);          // $C4A3/$C4A6 STA $03BC,X
  // $C4A9-$C4BC: yvel ramp-down by spawn index $69. The first 10 spawns ($69 <
  // $0A) lose 4; spawns 10-29 ($69 < $1E) lose 2; later spawns lose nothing.
  // Both CMPs read the POST-INC $69 (sub_C44F already incremented it).
  const cursor = sp.z69;                     // $C4A9 A5 69
  if (cursor < 0x1E) {                       // $C4AB C9 1E / $C4AD B0 10 BCS skip
    o.yvel[i] = u8(o.yvel[i] - 1);           // $C4AF DE BC 03
    o.yvel[i] = u8(o.yvel[i] - 1);           // $C4B2 DE BC 03  (yvel -= 2)
    if (cursor < 0x0A) {                     // $C4B5 C9 0A / $C4B7 B0 06 BCS skip
      o.yvel[i] = u8(o.yvel[i] - 1);         // $C4B9 DE BC 03
      o.yvel[i] = u8(o.yvel[i] - 1);         // $C4BC DE BC 03  (yvel -= 4 total)
    }
  }
  // $C4BF-$C4CA: the acceleration ($048C,X). $02 << 3 then AND #$07 is a DEAD
  // jitter term: three ASLs zero bits 0-2 before the AND, so it is always 0.
  // Transcribed faithfully (and pinned as inert by the mutation table below).
  const jitter = (u8(state.frame << 3)) & 0x07;   // $C4C1-C4C4 (always 0)
  o.s0480[i] = u8(jitter + rom.read(0xC4F8 + y)); // $C4C6 CLC / ADC $C4F8,Y / STA
  // $C4CD-$C4DC: hit counter, the CRATER X position, and the type byte $0A.
  o.s04A0[i] = 0x01;                        // $C4CD LDA #$01 / STA $04AC,X
  o.x[i] = rom.read(0xC4F4 + aa);           // $C4D2 LDY $AA / LDA $C4F4,Y / STA $036C,X
  o.type[i] = 0x0A;                         // $C4DA LDA #$0A / STA $030C,X
  // $C4DF LDA #$90 / STA $032C,X -- the volcano's base line. NOT part of the
  // shared tail: $C5AD writes $2C here instead (the ceiling) at $C5F9.
  o.y[i] = 0x90;                            // $C4DF LDA #$90 / STA $032C,X
  loc_C4E4(state, j);                       // fall through into loc_$C4E4
}

/**
 * `loc_$C4E4` -- the tail `st_$C486` FALLS INTO and `st_$C5AD` reaches by
 * `$C5FE JMP $C4E4`, a jump 281 bytes BACKWARD in the ROM with nothing
 * returning to it. Reading `st_$C5AD` top to bottom and stopping at its last
 * byte would ship a stage-4 rock with no animation and uninitialised velocity
 * fractions.
 *
 *   C4E4  A5 02 / 29 3F              A := $02 & $3F  (frame counter, low 6)
 *   C4E8  9D 4C 04 / 9D EC 03        xvelf AND yvelf both := that same value
 *   C4EE  A9 58 / 9D 2C 01           anim := metasprite $58
 *   C4F3  60                          RTS -- $C4F4 is the approachStage0 DATA
 *                                     block, so there is no further fall-out
 */
function loc_C4E4(state, j) {
  const o = state.obj; const i = j + ENEMY_BASE;
  o.xvelf[i] = state.frame & 0x3F;          // $C4E4 LDA $02 / AND #$3F / STA $044C,X
  o.yvelf[i] = state.frame & 0x3F;          // $C4EB STA $03EC,X
  o.anim[i] = 0x58;                         // $C4EE LDA #$58 / STA $012C,X
}

/**
 * `st_$C546` -- stage 2's late-spawner arm (jt_$C439[1]). Spawns the JELLYFISH
 * (type $0B -> entry 11 -> $B37F). Reached every 4th frame by the late spawner
 * (`$C413`'s `$02 & 3` gate), then a SECOND gate here (`$02 & 7`) halves that
 * to every 8th frame.
 *
 *   C546  A5 02 / AND #$07 / BEQ $C54D / RTS    second gate (every 8th)
 *   C54D  A2 02 / JSR $C44F                     pattern stepper, X=2 -> $C58D
 *   C552  A4 A9 / LDY $A9                       Y = a9 (nibble*2 position index)
 *   C554  A6 A8 / LDX $A8                        the slot the late spawner cleared
 *   C556  B9 6D C5 / STA $036C,X                X pos = $C56D[Y]
 *   C55C  B9 6E C5 / STA $032C,X                Y pos = $C56E[Y] (= $C56D[Y+1]!)
 *   C562  A9 0B / STA $030C,X                    type $0B
 *   C567  A9 67 / STA $012C,X                    anim $67
 *   C56C  RTS
 *
 * THE X/Y POSITION TABLES ARE OFFSET BY ONE BYTE: `$C56E = $C56D + 1`, so the
 * Y position of index `i` is `$C56D[i+1]`. The 32-byte run at `$C56D` is SIXTEEN
 * interleaved (x,y) pairs. `sub_$C44F` (ported W25) returns `{a9, aa}`; only
 * `a9` is used here (`aa` is the nibble selector the volcano uses for its
 * crater, unused by the jellyfish). `clearSlot` already ran in `lateSpawner`
 * before dispatch, so the slot is empty on entry.
 *
 * Span `$C546`-`$B56C` + the tables at `$C56D`; NO fall-out (RTS precedes the
 * data; `st_C58D` is the stream). Recon: 29-impl-stage2.md.
 */
function st_C546(state, rom) {
  const sp = state.spawn;
  const o = state.obj;
  // $C546 LDA $02 / AND #$07 / BEQ $C54D -- a SECOND gate on top of the late
  // spawner's every-4th: spawn only when $02 & 7 == 0. Combined: every 8th.
  if ((state.frame & 0x07) !== 0) return;       // $C54A BEQ $C54D / $C54C RTS
  // loc_C54D: X = 2 -> $C447+2 -> stream $C58D. a9 = nibble*2 (the position idx).
  const { a9 } = sub_C44F(state, rom, 0x02);    // $C54D LDX #$02 / $C54F JSR $C44F
  const i = sp.zA8 + ENEMY_BASE;                // $C554 LDX $A8 (the cleared slot)
  // $C556 LDA $C56D,Y (X) / $C55C LDA $C56E,Y (Y). a9 is even (nibble*2).
  o.x[i] = rom.read(0xC56D + a9);               // $C556/$C559 STA $036C,X
  o.y[i] = rom.read(0xC56E + a9);               // $C55C/$C55F STA $032C,X
  o.type[i] = 0x0B;                             // $C562 LDA #$0B / STA $030C,X
  o.anim[i] = 0x67;                             // $C567 LDA #$67 / STA $012C,X
}

/**
 * `st_$C5AD` -- stage 4's late-spawner arm (`jt_$C439[3]`). THE CEILING
 * VOLCANO. Stage 4's craters hang from the top of the screen and drop their
 * rocks, which is why this arm is `$C486` upside down: same sfx, same stepper,
 * a byte-identical descriptor table, but `$032C,X := $2C` (the ceiling)
 * instead of `$90`, and a type of `$15` -> entry 21 -> `$B377`, whose arc adds
 * Y where `$B36F`'s subtracts it.
 *
 * The cartridge agrees from a second direction: `$99FC LDA $19 / BEQ $9A06 /
 * CMP #$03 / BEQ $9A06` gives stages 1 and 4 -- and ONLY those two -- the
 * eruption sfx `$3F` at the end of the `$82` countdown. That branch has been
 * ported since W24 (`nmi.js` `st99E9`), a wave before anything here existed.
 *
 *   C5AD  A5 69 / D0 05                 sfx only on the first spawn ($69 == 0)
 *   C5B1  A9 0F / 20 1E EC              sfx $0F -- the rumble, same as $C48A
 *   C5B6  A2 04 / 20 4F C4              stepper X=4 -> $C447+4 -> stream $C633
 *   C5BB  LSR/CLC/ADC $A9 / TAY         Y = a9 * 1.5 (3-byte descriptor rows)
 *   C5C2  A6 A8                          the slot lateSpawner already cleared
 *   C5C4  $042C,X := $C603,Y            xvel
 *   C5CA  $03BC,X := $C604,Y            yvel
 *   C5D0  A5 69 / C9 1E / B0 06         ONE ramp arm, not the volcano's two
 *   C5D6  DEC $03BC,X x2                 yvel -= 2 while $69 < $1E
 *   C5DC  A5 02 / 29 0F / ADC $C605,Y   accel + a LIVE 0..15 jitter
 *   C5E7  $04AC,X := $01                 hit counter
 *   C5EC  A4 AA / $036C,X := $C601,Y    X = $38 or $B8, by the nibble parity
 *   C5F4  $030C,X := $15                 type $15 (raw -- $B377 sets bit 7)
 *   C5F9  $032C,X := $2C                 THE CEILING
 *   C5FE  4C E4 C4                       -> loc_$C4E4 (the shared tail)
 *
 * THE JITTER IS THE ONE THAT IS REAL. `$C4C1`'s three `ASL`s clear bits 0-2
 * before its `AND #$07`, so stage 1's acceleration jitter is identically zero
 * (W25 measured that and transcribed it as inert). `$C5DE` has no shifts: it
 * masks `$02` raw, so stage 4's acceleration genuinely varies. Two routines
 * that look like the same code and are not.
 *
 * It varies over FOUR values, not sixteen, and the reason is one gate up:
 * `$C415 AND #$03 / BEQ` means this arm only ever runs on frames where
 * `$02 & 3 == 0`, so `$02 & $0F` can only be 0, 4, 8 or 12. That is a property
 * of the cartridge, not of any particular run -- confirmed on the board over
 * 270 spawns (W31's `stage4poke.py`), which saw exactly those four and no
 * others.
 *
 * `$C601`-`$C632` is byte-identical to `$C4F4`-`$C525` -- the ROM carries two
 * copies of the descriptor rows. This port reads `$C601`, the address the
 * instruction names. No test can tell the two apart; see the worklog.
 */
function st_C5AD(state, rom) {
  const sp = state.spawn;
  const o = state.obj;
  // $C5AD LDY $69 / $C5AF D0 05 -- the rumble sfx fires only when the spawn
  // cursor is 0, i.e. once per eruption, exactly as $C486/$C488 does.
  if (sp.z69 === 0) {                       // $C5AF BNE $C5B6
    soundRequest(state, 0x0F);              // $C5B1 LDA #$0F / $C5B3 JSR $EC1E
  }
  // $C5B6 LDX #$04 / $C5B8 JSR $C44F -- X=4 reads the pointer at $C44B, which
  // is jt_$C439's tenth word: the 32-byte packed-nibble stream at $C633.
  const { a9, aa } = sub_C44F(state, rom, 0x04);
  // $C5BB-$C5C1: Y = a9 + (a9 >> 1) = 1.5*a9 -- 3-byte rows at $C603/4/5.
  const y = u8((a9 >>> 1) + a9);             // $C5BD LSR / CLC / ADC $A9 / TAY
  const j = sp.zA8;                          // $C5C2 LDX $A8
  const i = j + ENEMY_BASE;
  o.xvel[i] = rom.read(0xC603 + y);          // $C5C4/$C5C7 STA $042C,X
  o.yvel[i] = rom.read(0xC604 + y);          // $C5CA/$C5CD STA $03BC,X
  // $C5D0-$C5D9: ONE ramp arm. The POST-INC $69 (sub_C44F already stepped it):
  // the first 30 spawns of an eruption lose 2 from yvel, the rest lose nothing.
  // $C486 has a SECOND, inner arm at $C4B5 ($69 < $0A, another -2); $C5AD does
  // NOT -- $C5D4 BCS jumps straight past both DECs to $C5DC.
  if (sp.z69 < 0x1E) {                       // $C5D2 CMP #$1E / $C5D4 BCS $C5DC
    o.yvel[i] = u8(o.yvel[i] - 1);           // $C5D6 DE BC 03
    o.yvel[i] = u8(o.yvel[i] - 1);           // $C5D9 DE BC 03
  }
  // $C5DC-$C5E4: acceleration = descriptor + ($02 & $0F). Unlike $C4C1 this
  // jitter is LIVE (no ASLs before the mask), so successive spawns in the same
  // eruption fall at measurably different rates.
  const jitter = state.frame & 0x0F;         // $C5DC LDA $02 / $C5DE AND #$0F
  o.s0480[i] = u8(jitter + rom.read(0xC605 + y));  // $C5E1 ADC $C605,Y / STA $048C,X
  o.s04A0[i] = 0x01;                         // $C5E7 LDA #$01 / STA $04AC,X
  o.x[i] = rom.read(0xC601 + aa);            // $C5EC LDY $AA / LDA $C601,Y / STA $036C,X
  o.type[i] = 0x15;                          // $C5F4 LDA #$15 / STA $030C,X
  o.y[i] = 0x2C;                             // $C5F9 LDA #$2C / STA $032C,X
  loc_C4E4(state, j);                        // $C5FE JMP $C4E4 (the shared tail)
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
    return loadInline5(state, rom);      // THE STRIDE CHANGES HERE -- see below
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

// ======================= THE INLINE-5 ROUTE, $A37A ==========================
//
// THE STRIDE CHANGE. A wave record is TWO bytes -- `[trigger, cmd]` -- and the
// cursor $6A:$6B advances by 2 at $A34F. When the cmd is >= $F0 the record is
// FIVE bytes and the cursor advances by 5 at $A386 instead. Read straight out
// of the listing, because a misparse here does not throw: it desynchronises the
// whole remaining stream and emits WRONG enemies, which is much harder to see
// than a missing one.
//
//   A34B  CMP #$F0 / BCS $A37A                 <-- the split
//   A34F  LDA #$02 / LDX #$6A / JSR $8402      2-byte stride
//   A37A  LDY #$00
//   A37C  LDA ($6A),Y / INY / STA $63,X / INX / CPY #$05 / BCC $A37C
//   A386  LDA #$05 / LDX #$6A / JSR $8402      5-byte stride
//
// X IS STILL 0 at $A37A -- it was set by `$A33D LDX #$00`, four instructions
// before the trigger read, and nothing between touches it. So the five bytes
// land in $63, $64, $65, $66, $67 in that order: $63 gets the TRIGGER (a copy
// of the byte $A30C already read; write-only -- the whole PRG has no `LDA $63`,
// only the two stores $99E3 and $A37F), $64 gets the CMD.
//
// THE 73 RECORDS. 45 distinct in stage 3 (all -> $A46F, the moai) and 4 distinct
// in stage 5 (-> $A4A6, the ARM-GROUP allocator, ported in W32b). Stages 1, 2,
// 4, 6 and 7 have none. Counted by tools/oracle/wavecensus.py, which decodes the
// stride the same way; the two decoders agree byte for byte.

/** `$A37A` -- read the FIVE-byte record, advance the cursor by 5, then $A466. */
function loadInline5(state, rom) {
  const sp = state.spawn;
  const ptr = sp.z6A | (sp.z6B << 8);
  sp.z63 = rom.read(ptr);                  // $A37F STA $63,X  X = 0 (trigger)
  sp.z64 = rom.read(u16(ptr + 1));         //                  X = 1 (cmd)
  sp.z65 = rom.read(u16(ptr + 2));         //                  X = 2
  sp.z66 = rom.read(u16(ptr + 3));         //                  X = 3
  sp.z67 = rom.read(u16(ptr + 4));         //                  X = 4
  addCursor(sp, 5);                        // $A386 LDA #$05 / JSR $8402
  sp.z64 = u8(sp.z64 - 0x70);              // $A38D LDA $64 / SEC / SBC #$70
  inline5Arm(state, rom);                  // $A394 JMP $A466
}

/**
 * `$A466` -- the inline-5 arm selector, and it is an EQUALITY test:
 *
 *   A466  LDA $19 / CMP #$02 / BEQ $A46F / JMP $A4A6
 *
 * so ONLY in-game stage 3 gets $A46F; every other stage falls to $A4A6, the
 * ARM-GROUP allocator. It is also reached from $C676 (`JSR $A4A6`, stage 5's
 * late-spawner arm $C653).
 *
 * W32b PORTED $A4A6. The message this replaced called $0600 "the destructible
 * -terrain array" and said $A4A6 "scans it for a free cell before it spawns" --
 * both wrong. $0600 is the four-group ARM POOL and $A4A6 allocates groups OUT
 * of it, one per nibble of $65, before spawning their owner.
 *
 * `$A46C` IS A `JMP`, NOT A `JSR`: $A4A6's RTS returns to $A466's caller. The
 * port's `return` reproduces that -- nothing follows this call.
 */
function inline5Arm(state, rom) {
  if (state.zp19 === 2) return loc_A46F(state, rom);   // $A468 CMP #$02 / BEQ
  return sub_A4A6(state);                              // $A46C JMP $A4A6
}

/**
 * `$A46F` -- the MOAI spawner. Stage 3 only. It forces the type, which is why
 * the moai has no wave-record type of its own: the record carries a nametable
 * address instead.
 *
 *   A46F  LDX #$09 / LDA $030C,X / BEQ $A47A / DEX / BPL      DEX/BPL: tests 0
 *   A479  RTS                          allocation failed -> the spawn is DROPPED
 *   A47A  LDA #$01 / STA $5D           an absolute STORE (the $A335 INC already
 *                                      ran; this pins it at 1, it does not add)
 *   A47E  STX $A8 / JSR $A527
 *   A483  LDX $A8 / STA $69            <-- $69 := sub_$A527's exit A
 *   A487  $010C,X := $64               status = cmd - $70, i.e. $80..$8F
 *   A48C  $032C,X := $65               Y
 *   A491  $03BC,X := $66               the moai's NAMETABLE ADDRESS, high byte
 *   A496  $03EC,X := $67               ...and low byte  (yvel:yvelf, reused)
 *   A49B  $030C,X := $96               type $96 -> entry 22 -> $C906
 *   A4A0  $036C,X := $F0               X = the right edge
 *
 * `$A485 STA $69` STORES ZERO, and that is not a guess: `sub_$A527` sets A to 0
 * at `$A537 LDA #$00` and every instruction after it is a `STA`/`INX`, so it
 * RTSes with A = 0. `$A483 LDX $A8` does not touch A. So a moai spawn CANCELS
 * any squadron still emitting ($69 is the members-remaining counter). Faithful,
 * and observable: a squadron mid-emission stops.
 */
function loc_A46F(state, rom) {
  const sp = state.spawn;
  const o = state.obj;
  const j = allocEnemySlot(state, true);   // $A46F LDX #$09 ... DEX / BPL
  if (j < 0) return;                       // $A479 RTS -- the spawn is DROPPED
  sp.z5D = 1;                              // $A47A LDA #$01 / STA $5D
  sp.zA8 = j;                              // $A47E STX $A8
  clearSlot(state, j);                     // $A480 JSR $A527   (returns A = 0)
  sp.z69 = 0;                              // $A485 STA $69 -- sub_$A527's exit A
  const i = j + ENEMY_BASE;                // $A483 LDX $A8
  o.status[i] = sp.z64;                    // $A487 LDA $64 / STA $010C,X
  o.y[i] = sp.z65;                         // $A48C LDA $65 / STA $032C,X
  o.yvel[i] = sp.z66;                      // $A491 LDA $66 / STA $03BC,X
  o.yvelf[i] = sp.z67;                     // $A496 LDA $67 / STA $03EC,X
  o.type[i] = 0x96;                        // $A49B LDA #$96 / STA $030C,X
  o.x[i] = 0xF0;                           // $A4A0 LDA #$F0 / STA $036C,X
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
  // $BBEC STY $98 -- the per-frame countdown subtract. $BBBB LDY #$01, and the
  // ladder at $BBC3-$BBEB accelerates it. $BBBD LDA $19 / ORA $1A / BEQ $BBEC:
  // stage 1 / loop 0 skips the whole ladder (sub stays 1). Stage 2+ runs it.
  // Ported W29 (stage 2 reaches it: $19=1 fails the BEQ); the ROM is the
  // authority at rip/prg.asm line 6893. For stage 2 / loop 0 / no shield / rank
  // < 3 the ladder still yields 1; rank >= 3 yields 2 (enemies fire 2x faster).
  let sub = 1;                                  // $BBBB LDY #$01
  if (state.zp19 !== 0 || state.zp1A !== 0) {   // $BBBD/$BBBF ORA $1A / $BBC1 BEQ
    // $BBC3 LDA $02 / AND #$01 / BNE $BBE5: ODD frames skip the $1A/$46 arms
    // and go straight to the rank check at $BBE5.
    if ((state.frame & 0x01) === 0) {           // $BBC5 AND #$01 / $BBC7 BNE
      if (state.zp1A !== 0) {                    // $BBC9 LDA $1A / BEQ $BBDA
        sub += 1;                                // $BBCD INY (loop >= 1)
        if (state.zp1A >= 2) sub += 1;           // $BBCE CMP #$02 / BCC / BBD2 INY
        if (state.zp.shield !== 0) sub += 1;     // $BBD3 LDA $46 / BEQ / BBD7 INY
      } else if (state.zp.shield !== 0 && state.zp19 >= 2) {  // loc_BBDA (loop 0)
        sub += 1;                                // $BBDE/$BBE0 CMP #$02 / BCC / BBE4 INY
      }
    }
    // loc_BBE5 -- the rank arm runs on EVERY frame that entered the ladder
    // (both parities converge here): rank >= 3 bumps $98 once more.
    if (state.zp17 >= 3) sub += 1;               // $BBE5-$BBE9 / $BBEB INY
  }
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
 *
 * ---- WAVE 32c: THE SKIP ARM, AND IT WAS NOT A STAGE-5 GAP ------------------
 *
 * `$BC44 LDA $1A / BNE $BC59` and `$BC48 LDA $19 / CMP #$02 / BCS $BC59` were a
 * LOUD THROW until this wave, tagged "stages 3+ are out of scope (W29 ships
 * stage 2)". Two things about that were wrong by the time W32c read it:
 *
 *  1. **It was never a stage-5 wall.** The bound is `$19 >= 2`, so it fires on
 *     stages 3, 4, 5, 6 AND 7 -- and stages 3 ($19=2) and 4 ($19=3) have been
 *     past the `$A2F0` scope guard since W30 and W31, with stageledger.py
 *     printing RUNNABLE for both. **Any enemy firing a bullet on stage 3 or 4
 *     crashed the port**, and no ledger column could see it, because the ledger
 *     measures type-to-handler coverage and this is a per-frame path inside an
 *     already-ported handler -- the exact shape W32b's `$CBD1` had.
 *  2. **There is nothing to port.** The two branches both land on `$BC59`, the
 *     allocator, which has been ported since wave 11. The arm is eight bytes of
 *     test and the body is the `else` that was already there.
 *
 * Found by W32c because it is the third thing that stops a stage-5 frame, after
 * `$BEF3` and `$CBD1`; it was reached at frame 190 of the first 600-frame
 * stage-5 run and it is NOT in W32a's five-wall list, W32b's worklog, or the
 * recon. Stated as what it is: a gap that shipped inside two "RUNNABLE" stages.
 */
function fireBullet(state, res, j) {
  // $BC44 LDA $1A / BNE $BC59 -- any LOOP skips the gate. $1A is pinned at 0
  // in this port (loop-2 difficulty does not exist yet), so this arm is
  // transcribed and unexercised; the $19 arm below is the live one.
  // $BC48 LDA $19 / CMP #$02 / BCS $BC59 -- stage 3 and up skip it too.
  if (state.zp1A !== 0 || state.zp19 >= 2) {  // $BC44 / $BC48 CMP #$02
    allocBullet(state, res, j);               // $BC46/$BC4C BNE/BCS $BC59
    return;
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
    // $BD2A LDA #$00 -- and then the SHALLOW arm, which is a separate ENTRY
    // POINT: `$B8DE LDA #$40 / JSR $BD2C` (entry 23's muzzle setup) jumps into
    // it with A = $40 and its own $99:$9A. See loc_BD2C below.
    return loc_BD2C(state, i, 0x00, hi, lo);
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
 * `$BD2C` -- the SHALLOW-angle velocity writer, and an ENTRY POINT in its own
 * right.
 *
 * `$BCB5`'s aim reaches it by falling off `$BD2A LDA #$00` (so A = 0 and the
 * X-velocity fraction starts at zero), but `$B8DE LDA #$40 / JSR $BD2C` -- the
 * three-muzzle setup inside entry 23 (`$B7A1`) -- calls it DIRECTLY with A =
 * `$40` and with `$99`/`$9A` loaded from `$B8E9,Y`/`$B8E6,Y` instead of from
 * the divide. That is why the leading `STA $044C,X` takes its byte as a
 * parameter rather than being written as a constant 0.
 *
 * @param i   the OBJECT INDEX the ROM's X register addresses (slot + $0C)
 * @param a   the accumulator on entry: 0 from $BD2A, $40 from $B8DC
 * @param hi  `$99`
 * @param lo  `$9A`
 */
function loc_BD2C(state, i, a, hi, lo) {
  const o = state.obj;
  o.xvelf[i] = a;                        // $BD2C STA $044C,X
  o.xvel[i] = 1;                         // $BD2F LDA #$01 / $BD31 STA $042C,X
  o.yvelf[i] = lo;                       // $BD34 LDA $9A / $BD36 STA $03EC,X
  o.yvel[i] = hi;                        // $BD39 LDA $99 / $BD3B STA $03BC,X
  let c = lo & 1;                        // $BD3E LSR $99 / $BD40 ROR $9A
  lo = (lo >> 1) | ((hi & 1) << 7); hi >>= 1;
  if (state.zp1A !== 0) {                // $BD42 LDA $1A / $BD44 BEQ $BD5B
    let s = lo + o.yvelf[i] + c;         // $BD46 LDA $9A / ADC $03EC,X -- the ROR's
    o.yvelf[i] = u8(s);                  //   carry, because BEQ did not touch it
    s = hi + o.yvel[i] + (s > 0xFF ? 1 : 0);     // $BD4E LDA $99 / ADC $03BC,X
    o.yvel[i] = u8(s);
    o.xvelf[i] = 0x80;                   // $BD56 LDA #$80 / $BD58 STA $044C,X
  }
  c = lo & 1;                            // $BD5B LSR $99 / $BD5D ROR $9A
  lo = (lo >> 1) | ((hi & 1) << 7); hi >>= 1;
  // $BD5F LDA $17 / CMP #$02 / BCC $BD7D -- and the CMP REPLACES `c` with 1
  // on the only path that reaches the adds.
  if (state.zp17 >= 2) {
    let s = lo + o.yvelf[i] + 1;         // $BD65 LDA $9A / ADC $03EC,X, carry SET
    o.yvelf[i] = u8(s);
    s = hi + o.yvel[i] + (s > 0xFF ? 1 : 0);     // $BD6D LDA $99 / ADC $03BC,X
    o.yvel[i] = u8(s);
    s = o.xvelf[i] + 0x40 + (s > 0xFF ? 1 : 0);  // $BD75 LDA $044C,X / ADC #$40
    o.xvelf[i] = u8(s);
  }
}                                        // $BD7D RTS

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

/**
 * `$BDFA` -- the AIMED-movement core, for an ENEMY (not a bullet). Entered at
 * `$BDFA` directly (NOT `$BDD5`) by `$B3B9 JSR $BDFA` inside `$B37F`, so it
 * runs ONLY the movement: read the direction byte `$046C,X`, move X by
 * `$042C:$044C` (sign = bit 1), free if X leaves [2,$FB], move Y by
 * `$03BC:$03EC` (sign = bit 0), free if Y leaves [8,$C3]. `$BE6B JMP $AEF8`
 * frees via the short free.
 *
 * This is the SAME core `moveBullet` (above) inlines for the bullet slot
 * `22+x`; here the slot is the enemy's own `j + ENEMY_BASE` and the free uses
 * the enemy index `j`. Transcribed separately rather than factored, because
 * `moveBullet` is measured GREEN and bundles its own bullet animation/off-screen
 * arms around the core -- sharing it would risk that measurement.
 *
 * `$046C,X` is the direction byte `$BD21` wrote (`aimBullet`, two bits: bit 1 =
 * X sign, bit 0 = Y sign). The velocity was set by the same `aimBullet` call.
 */
function moveAimedEnemy(state, j) {
  const o = state.obj; const i = j + ENEMY_BASE;
  const dir = o.s0460[i];                        // $BDFA LDA $046C,X
  let nx;
  if (dir >= 2) {                                // $BDFD CMP #$02 / BCC $BE17
    const f = o.xf[i] + o.xvelf[i];              // $BE01 LDA $044C,X / CLC / ADC
    o.xf[i] = u8(f);                             // $BE08 STA $038C,X
    nx = u8(o.x[i] + o.xvel[i] + (f > 0xFF ? 1 : 0));   // $BE0B/$BE0E ADC $036C,X
    o.x[i] = nx;                                 // $BE11 STA $036C,X
  } else {
    const f = o.xf[i] - o.xvelf[i];              // $BE17 LDA $038C,X / SEC / SBC
    o.xf[i] = u8(f);                             // $BE1E STA $038C,X
    nx = u8(o.x[i] - o.xvel[i] - (f < 0 ? 1 : 0));      // $BE21/$BE24 SBC $042C,X
    o.x[i] = nx;                                 // $BE27 STA $036C,X
  }
  // $BE2A CMP #$02 / BCC $BE6B / CMP #$FC / BCS $BE6B (A = the X just stored).
  if (nx < 2 || nx >= 0xFC) return freeSlot(state, j);
  let ny;
  if (dir & 1) {                                 // $BE32 LDA $046C,X / AND #$01
    const f = o.yf[i] + o.yvelf[i];              // $BE39 LDA $03EC,X / CLC / ADC
    o.yf[i] = u8(f);                             // $BE40 STA $034C,X
    ny = u8(o.y[i] + o.yvel[i] + (f > 0xFF ? 1 : 0));   // $BE43/$BE46 ADC $032C,X
    o.y[i] = ny;                                 // $BE49 STA $032C,X
  } else {
    const f = o.yf[i] - o.yvelf[i];              // $BE4F LDA $034C,X / SEC / SBC
    o.yf[i] = u8(f);                             // $BE56 STA $034C,X
    ny = u8(o.y[i] - o.yvel[i] - (f < 0 ? 1 : 0));      // $BE59/$BE5C SBC $03BC,X
    o.y[i] = ny;                                 // $BE5F STA $032C,X
  }
  // $BE62 CMP #$08 / BCC $BE6B / CMP #$C4 / BCS $BE6B / $BE6A RTS.
  if (ny < 8 || ny >= 0xC4) return freeSlot(state, j);   // $BE6B JMP $AEF8
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
    case 0xB36F: return h_B36F(state, j);        // entry 10, types $0A/$8A (volcano)
    case 0xB37F: return h_B37F(state, rom, j);   // entry 11, types $0B/$8B (jellyfish)
    case 0xB3CB: return h_B3CB(state, rom, j);   // entry 12, types $0C/$8C
    // ---- WAVE 26: the boss ------------------------------------------------
    case 0xB914: return h_B914(state, rom, j);   // entry 24, types $18/$98 (head)
    case 0xB913: return h_B913(state);           // entry 25, types $19/$99 (inert body)
    // ---- WAVE 27: the warp rain ------------------------------------------
    case 0xB61E: return h_B61E(state, rom, j);   // entry 38, types $26/$A6 (warp rain)
    // ---- WAVE 30: stage 3 ------------------------------------------------
    case 0xB402: return h_B402(state, rom, j);   // entry 13, types $0D/$8D
    case 0xB434: return h_B434(state, rom, j);   // entry 14, types $0E/$8E
    case 0xC906: return h_C906(state, rom, j);   // entry 22, types $16/$96 (moai)
    case 0xB7A1: return h_B7A1(state, rom, j);   // entry 23, types $17/$97 (chaser)
    case 0xB4FD: return h_B4FD(state, rom, j);   // entry 28, types $1C/$9C
    // ---- WAVE 31: stage 4 ------------------------------------------------
    case 0xB377: return h_B377(state, j);        // entry 21, types $15/$95
    // ---- WAVE 32a: stage 5's chunks 0 and 1 -------------------------------
    case 0xB559: return h_B559(state, rom, j);   // entry 29, types $1D/$9D
    // ---- WAVE 32b: the stage-5 $0600 ARM POOL -----------------------------
    case 0xCA5E: return h_CA5E(state, rom, j);   // entry 20, types $14/$94 (arm owner)
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
  sub_B2AF(state, j);                    // $B2AF (named below; $B546 JSRs it)
}

/**
 * `sub_$B2AF` -- Y into the velocity pair, decay it, put it back, then the box.
 * Named because `$B546` (inside entry 28, `$B4FD`) calls it as a subroutine.
 */
function sub_B2AF(state, j) {
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
  loc_B2D2(state, j);                    // $B2D2 (named below; $B556 JMPs to it)
}

/**
 * `loc_$B2D2` -- the mirror of `sub_$B2AF`: the velocity GAINS the acceleration
 * instead of losing it. Named because `$B556` (entry 28, `$B4FD`) `JMP`s here.
 */
function loc_B2D2(state, j) {
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
  return loc_B1DA(state, j);              // $B1DA (named below -- $B402 shares it)
}

/**
 * `$B1DA` -- X moves by the direction flag, Y rises, the velocity decays, then
 * the off-screen box. Named because entry 13 (`$B402`) tail-calls it too
 * (`$B42C JMP $B1DA`), not only handler 6.
 */
function loc_B1DA(state, j) {
  const o = state.obj; const i = j + ENEMY_BASE;
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

/**
 * `$B212` -- accel := $20, then `$B217 JMP $B22E`: seed the arc with yvel = 2.
 *
 * A named entry because it is not private to `$B205`: `$B40F` (inside entry 13,
 * `$B402`) and `$B44E` (inside entry 14, `$B434`) both `JMP $B212`, which is
 * the whole reason those two handlers are as short as they are.
 */
function loc_B212(state, j) {
  state.obj.s0480[j + ENEMY_BASE] = 0x20;  // $B212 LDA #$20 / STA $048C,X
  seedArc(state, j, 0x02);                 // $B217 JMP $B22E -> LDA #$02 / $B1B1
}

function h_B205(state, j) {
  const o = state.obj; const i = j + ENEMY_BASE;
  if (!(o.type[i] & 0x80)) {             // $B205 LDA $030C,X / BMI $B21A
    o.s0460[i] = 0;                      // $B20A LDA #$00 / STA $046C,X
    setInitialised(state, j);            // $B20F JSR $B0B4
    loc_B212(state, j);                  // $B212/$B217 -- see above
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
  loc_B212(state, j);                    // $B212 -> $B217 -> $B22E -> $B1B1
}

// ============ WAVE 30: ENTRIES 13 AND 14, THE SHARED $B205 PAIR =============
//
// `$B402` (entry 13, types $0D/$8D) and `$B434` (entry 14, types $0E/$8E) are
// two arcing enemies that SHARE `loc_$B407`, and each has its own five-byte
// copy of $B200's turn schedule ($B42F and $B45C -- byte-identical, and the ROM
// really does carry two). Stages 3, 4 and 5 all name both; porting them here
// makes stage 4's only two missing entries FREE (W31).
//
// THE TABLE OVERRUN IS REAL AND IS READ FROM ROM, not thrown on. `$B415
// LDA $B42F,Y` with Y = `$04AC,X` is exactly the shape `$B1C5` has, and the port
// throws THERE -- but there the throw is backed by a 27,400-frame measurement
// that Y never exceeded 4. NO SUCH MEASUREMENT EXISTS FOR $B42F/$B45C, so
// inventing a throw would be inventing an absence proof. The exporter ships
// five bytes each (`phaseB42F`/`phaseB45C`, anchored on the next instruction),
// so a Y >= 5 gets romByteReader's OWN loud throw naming the address -- which is
// the honest outcome: "the port cannot read $B434 as a table entry", not "the
// cartridge never does".

/**
 * `loc_$B407` -- the shared init both entries fall into.
 *
 *   B407  JSR $B0B4                    set the initialised bit
 *   B40A  LDA #$00 / STA $04AC,X       arc counter := 0
 *   B40F  JMP $B212                    accel $20 + seed the arc (yvel 2)
 */
function loc_B407(state, j) {
  setInitialised(state, j);              // $B407 JSR $B0B4
  state.obj.s04A0[j + ENEMY_BASE] = 0;   // $B40A LDA #$00 / STA $04AC,X
  loc_B212(state, j);                    // $B40F JMP $B212
}

/**
 * Entry 13, `$B402` (types $0D/$8D). Stage 3 (2 records), 4 and 5.
 *
 *   B402  LDA $030C,X / BMI $B412            initialised -> the run arm
 *   B407  (shared init above)
 *   B412  LDY $04AC,X / LDA $B42F,Y / STA $046C,X   direction from the schedule
 *   B41B  LDX $A8                            reload X (a no-op: X already = $A8)
 *   B41D  LDA $03BC,X / BPL $B42C            yvel >= 0 -> just move
 *   B422  CMP #$FE / BCS $B42C               yvel >= -2 -> just move
 *   B426  INC $04AC,X / JMP $B40F -> $B212   past -2: next arc
 *   B42C  JMP $B1DA                          $046C ? subX16 : addX16, then the box
 *
 * `$B41B LDX $A8` is transcribed as nothing because X already holds `$A8`: the
 * update loop set it and neither `$B412` nor `$B415` touches X. It is in the
 * comment so a reader of the listing can find the line.
 */
function h_B402(state, rom, j) {
  const o = state.obj; const i = j + ENEMY_BASE;
  if (!(o.type[i] & 0x80)) return loc_B407(state, j);   // $B402/$B405 BMI $B412
  const y = o.s04A0[i];                   // $B412 LDY $04AC,X
  o.s0460[i] = rom.read(0xB42F + y);      // $B415 LDA $B42F,Y / $B418 STA $046C,X
  const yv = o.yvel[i];                   // $B41D LDA $03BC,X
  if ((yv & 0x80) !== 0 && yv < 0xFE) {   // $B420 BPL $B42C / $B422 CMP #$FE / BCS
    o.s04A0[i] = u8(y + 1);               // $B426 INC $04AC,X
    return loc_B212(state, j);            // $B429 JMP $B40F -> $B212
  }
  return loc_B1DA(state, j);              // $B42C JMP $B1DA
}

/**
 * Entry 14, `$B434` (types $0E/$8E). Stage 3 (3 records), 4 and 5.
 *
 *   B434  LDA $030C,X / BPL $B407            NOT initialised -> the shared init
 *   B439  LDY $04AC,X / LDA $B45C,Y / STA $046C,X
 *   B442  LDA $03BC,X / BPL $B451
 *   B447  CMP #$FE / BCS $B451
 *   B44B  INC $04AC,X / JMP $B212            (a JMP, not $B40F -- same target)
 *   B451  LDA $046C,X / BNE $B459
 *   B456  JMP $B1F1                          direction 0: X += xvel, Y += yvel
 *   B459  JMP $B1FA                          direction != 0: X -= xvel, Y += yvel
 *
 * THE DIFFERENCE FROM `$B402` IS THE TAIL, and it is the whole enemy: $B402
 * goes to `$B1DA` (X moves, Y moves UP by `$B140`, then `$B120` decays the
 * velocity -- an arc), while `$B434` goes to `$B1F1`/`$B1FA` (X moves, Y moves
 * DOWN by `$B16C`). Same schedule, mirrored vertical.
 *
 * `$B1FA` had never been reachable before this wave: the port's `subX16` header
 * says so in as many words -- "its only call sites are $B1E5 and $B1FA, both
 * inside handler 6's run path... $B1FA is still unreachable -- it belongs to
 * $B37C and $B459, two handlers that are still throws". $B459 is THIS routine.
 */
function h_B434(state, rom, j) {
  const o = state.obj; const i = j + ENEMY_BASE;
  if (!(o.type[i] & 0x80)) return loc_B407(state, j);   // $B434/$B437 BPL $B407
  const y = o.s04A0[i];                   // $B439 LDY $04AC,X
  o.s0460[i] = rom.read(0xB45C + y);      // $B43C LDA $B45C,Y / $B43F STA $046C,X
  const yv = o.yvel[i];                   // $B442 LDA $03BC,X
  if ((yv & 0x80) !== 0 && yv < 0xFE) {   // $B445 BPL $B451 / $B447 CMP #$FE / BCS
    o.s04A0[i] = u8(y + 1);               // $B44B INC $04AC,X
    return loc_B212(state, j);            // $B44E JMP $B212
  }
  if (o.s0460[i] === 0) return arcRightDown(state, j);  // $B451/$B456 JMP $B1F1
  return loc_B1FA(state, j);              // $B459 JMP $B1FA
}

/**
 * Entry 28, `$B4FD` (types `$1C`/`$9C`) -- stage 3, 2 records. A four-phase
 * lander: it walks left one pixel a frame, waits out a $14-frame timer, then
 * dives or climbs toward the ship's Y and settles.
 *
 *   B4FD  LDA $030C,X / BMI $B510
 *   B502  JSR $B0B4 / $048C := $80 / $04AC := $14 / RTS      <- loc_B502
 *   B510  LDY #$03 / JSR $B628          the shared animator, record 3
 *   B515  DEC $036C,X                   one pixel left, every frame
 *   B518  JSR $B251                     ...and the box, which may FREE the slot
 *   B51B  LDY $046C,X / BEQ $B52A       phase 0: the countdown
 *   B520  DEY / BEQ $B538               phase 1: pick down ($02) or up ($03)
 *   B523  DEY / BEQ $B546               phase 2: fall  ($B2AF, velocity decays)
 *   B526  DEY / BEQ $B556               phase 3: rise  ($B2D2, velocity grows)
 *   B529  RTS                           phase >= 4: nothing
 *
 * `loc_$B502` IS THE SHARED BODY stage 5's `$B559` will ride on (`$B55C BPL
 * $B502`), which is why it is its own function here: W32's `$B559` is a
 * nine-line wrapper over it and must not re-transcribe it.
 *
 * `$B518 JSR $B251` CAN FREE THE SLOT AND THE ROUTINE KEEPS GOING. `$AEF8`
 * clears only five bytes -- type, status, anim, timer, animFrame -- so `$046C`
 * survives the free and `$B51B` reads it anyway, and a phase-0 object then
 * DECs `$04AC` on a slot that is no longer alive. That is transcribed, not
 * tidied: the writes land on a free slot and the next `$A527` wipes them, but
 * `$04AC` is observable in between.
 */
function h_B4FD(state, rom, j) {
  const o = state.obj; const i = j + ENEMY_BASE;
  if (!(o.type[i] & 0x80)) return loc_B502(state, j);   // $B4FD/$B500 BMI $B510
  sub_B628(state, rom, j, 3);            // $B510 LDY #$03 / $B512 JSR $B628
  o.x[i] = u8(o.x[i] - 1);               // $B515 DEC $036C,X
  offScreenCheck(state);                 // $B518 JSR $B251 -- may free the slot
  const phase = o.s0460[i];              // $B51B LDY $046C,X
  if (phase === 0) {                     // $B51E BEQ $B52A
    o.s04A0[i] = u8(o.s04A0[i] - 1);     // $B52A DEC $04AC,X
    if (o.s04A0[i] !== 0) return;        // $B52D LDA $04AC,X / $B530 BNE $B537
    o.s0460[i] = 0x01;                   // $B532 LDA #$01 / $B534 STA $046C,X
    return;
  }
  if (phase === 1) {                     // $B520 DEY / $B521 BEQ $B538
    // $B538 LDA #$02 / LDY $032C,X / CPY $0320 / BCS $B534 -- the enemy is at
    // or below the ship: phase 2 (fall). Otherwise $B542 LDA #$03 (rise).
    o.s0460[i] = (o.y[i] >= state.obj.y[0]) ? 0x02 : 0x03;
    return;
  }
  if (phase === 2) {                     // $B523 DEY / $B524 BEQ $B546
    sub_B2AF(state, j);                  // $B546 JSR $B2AF
    // $B549 LDA $032C,X / CMP $0320 / BNE rts -- settle only on an exact match.
    if (o.y[i] !== state.obj.y[0]) return;         // $B54F BEQ $B552 / $B551 RTS
    o.s0460[i] = 0x04;                   // $B552 LDA #$04 / $B554 BNE $B534
    return;
  }
  if (phase === 3) return loc_B2D2(state, j);      // $B526 DEY / $B527 BEQ $B556
  // $B529 RTS -- phases >= 4 (i.e. the settled state) do nothing more.
}

// ============ WAVE 30: ENTRY 23, $B7A1 -- THE STAGE-3 CHASER ================
//
// SPAN `$B7A1`-`$B8E5`, with a data table INSIDE it at `$B852` (the by-rank hit
// counts) and the muzzle tables immediately after at `$B8E6`. 187 listing
// lines, the biggest bespoke handler in stages 2-7, and it does NOT end where
// it first looks like it does: `$B841 JMP $CB26` and `$B7F3 JMP $B690` are two
// exits, and `$B85A`/`$B868`/`$B87C`/`$B890`/`$B8A5` are all continuations of
// the same routine reached by branches, not separate subroutines.
//
// TWO PRODUCERS, and only two: the single stage-3 wave record whose descriptor
// names type $17, and `$C6BC STA $030C,X` in the late spawner's stage-3 arm
// ($C686 with $3A = 0, which reads $C6CC[0] = $97). $B7A1 also re-writes its
// own type EVERY frame ($B7AD), so it never runs an "initialised" branch --
// there is no `LDA $030C,X / BMI` at the top at all.
//
// THE TWO $0460 ARRAYS ARE BOTH USED HERE AND THEY ARE DIFFERENT BYTES:
//   $B7A8 STA $0460,X   X = $A8 = the RAW slot index -> s0460[j], the COLLISION
//                       BOX CLASS ($C020/$C11C `LDX $0460,Y`)
//   $B836 LDA $046C,X   X = $A8 as well, but the address is $0460 + $0C + X ->
//                       s0460[j + 12], the HIT ACCUMULATOR ($C086 adds to it)
// This is the $030B,X alias family the plan's risk 5 names. Getting it wrong
// makes the chaser either invincible or unhittable and nothing throws.

/**
 * Entry 23, `$B7A1` (types `$17`/`$97`).
 *
 *   B7A1  LDX $A8
 *   B7A3  $010C := $80              status, EVERY frame
 *   B7A8  $0460,X := $01            the hit-box class (RAW index -- see above)
 *   B7AD  $030C := $97              the type, EVERY frame
 *   B7B2  LDY $048C,X / $012C := $B797[Y]     $3F closed / $40 open
 *   B7BB  LDY $17                             the rank, for the four rows below
 *   B7BD  LDA $04CC,X / CMP #$28 / BCS $B7DF  entry counter done -> chase
 *   B7C4  LDA $0360 / CMP $036C,X / BCC $B7DF ship is LEFT of it -> chase
 *   B7CC  INC $04CC,X                         still entering
 *   B7CF  LDA $036C,X / CMP #$F0 / BCS $B7F6  at the right edge -> no X move
 *   B7D6  INC $036C,X / INC $036C,X           slide RIGHT 2 px
 *   B7DF  $038C -= $B78F[rank] / $036C -= 1 (16-bit)   the chase, LEFT
 *   B7F3  JMP $B690 -> $AEF8                  X underflowed: free the slot
 *   B7F6  the Y chase, toward $0320, at $B799[rank]/256 px per frame,
 *         clamped to [$14, $AC]
 *   B82C  LDA $03BC,X / CMP $B787[rank] / BCS $B85A    charged -> fire
 *   B836  LDA $046C,X / CMP $B852[rank] / BCC $B846    enough hits -> die
 *   B83E  JSR $844F (+$0300) / LDA #$0C / JMP $CB26    the death
 *   B846  INC $03BC,X (twice if $048C is set)          charge
 */
function h_B7A1(state, rom, j) {
  const o = state.obj; const i = j + ENEMY_BASE;
  o.status[i] = 0x80;                    // $B7A3 LDA #$80 / STA $010C,X
  o.s0460[j] = 0x01;                     // $B7A8 STA $0460,X -- the RAW index
  o.type[i] = 0x97;                      // $B7AD LDA #$97 / STA $030C,X
  o.anim[i] = rom.read(0xB797 + o.s0480[i]);   // $B7B2 LDY $048C,X / LDA $B797,Y
  const rank = state.zp17;               // $B7BB LDY $17
  // ---- the X axis ----------------------------------------------------
  let chase = true;
  if (o.s04C0[i] < 0x28 && state.obj.x[0] >= o.x[i]) {  // $B7BD/$B7C4
    chase = false;
    o.s04C0[i] = u8(o.s04C0[i] + 1);     // $B7CC INC $04CC,X
    if (o.x[i] < 0xF0) {                 // $B7CF CMP #$F0 / BCS $B7F6
      o.x[i] = u8(o.x[i] + 1);           // $B7D6 INC $036C,X
      o.x[i] = u8(o.x[i] + 1);           // $B7D9 INC $036C,X
    }
  }
  if (chase) {                           // loc_B7DF
    const f = o.xf[i] - rom.read(0xB78F + rank);   // $B7DF SEC / SBC $B78F,Y
    o.xf[i] = u8(f);
    const x = o.x[i] - 1 - (f < 0 ? 1 : 0);        // $B7E9 SBC #$01
    o.x[i] = u8(x);
    if (x < 0) return freeSlot(state, j);          // $B7F1 BCS / $B7F3 JMP $B690
  }
  // ---- the Y axis, loc_B7F6 ------------------------------------------
  // The CMP at $B7F9 sets the carry the SBC/ADC below consume, so both are
  // plain (borrow-free / carry-free) 16-bit steps.
  const step = rom.read(0xB799 + rank);
  let ny;
  if (o.y[i] >= state.obj.y[0]) {        // $B7F6 CMP $0320 / $B7FC BCC $B80F
    const f = o.yf[i] - step;            // $B7FE LDA $034C,X / SBC $B799,Y
    o.yf[i] = u8(f);
    ny = u8(o.y[i] - (f < 0 ? 1 : 0));   // $B807 LDA $032C,X / SBC #$00
  } else {
    const f = o.yf[i] + step;            // $B80F LDA $034C,X / ADC $B799,Y
    o.yf[i] = u8(f);
    ny = u8(o.y[i] + (f > 0xFF ? 1 : 0));// $B818 LDA $032C,X / ADC #$00
  }
  if (ny < 0x14) ny = 0x14;              // $B81D CMP #$14 / BCS / LDA #$14
  if (ny >= 0xAC) ny = 0xAC;             // $B823 CMP #$AC / BCC / LDA #$AC
  o.y[i] = ny;                           // $B829 STA $032C,X
  // ---- charge / fire / die, loc_B82C ---------------------------------
  if (o.yvel[i] >= rom.read(0xB787 + rank)) return fireB7A1(state, rom, j);  // $B834
  if (o.s0460[i] >= rom.read(0xB852 + rank)) {     // $B836 LDA $046C,X / BCC $B846
    addScore(state, 0x00, 0x03, 0x00);   // $B83E JSR $844F ($9A := 3) -- +$0300
    soundRequest(state, 0x0C);           // $B841 LDA #$0C / JMP $CB26 -> $CB28
    explodeInPlace(state, j);            // $CB2B
    return;
  }
  o.yvel[i] = u8(o.yvel[i] + 1);         // $B846 INC $03BC,X
  if (o.s0480[i] !== 0) {                // $B849 LDA $048C,X / $B84C BEQ $B851
    o.yvel[i] = u8(o.yvel[i] + 1);       // $B84E INC $03BC,X -- twice while open
  }
}                                        // $B851 RTS

/**
 * `loc_$B85A` -- entry 23's fire block. It alternates: on a frame when `$048C`
 * is already set it just CLOSES (both `$048C` and the charge `$03BC` back to
 * 0); on a frame when it is clear it opens and fires up to THREE bullets.
 *
 *   B85A  LDA $048C,X / BEQ $B868 / (else) $048C := 0, $03BC := 0, RTS
 *   B868  $048C := 1, $03BC := 1
 *   B870  $A0 = $A1 = $A2 = $80        the "no slot" sentinel
 *   B878  LDY #$09 / LDX #$00
 *   B87C  scan the ten enemy-BULLET slots 9..0 for `$0136,Y == 0`, keeping the
 *         first THREE indices in $A0-$A2 ($B885 CPX #$03 / BCS $B88C stops)
 *   B88C  DEX / BPL $B890 / RTS         none found -> nothing fires
 *   B890  STX $A9                       $A9 = (count - 1), the loop counter
 *   B892  $A3 = the chaser's X, $A4 = its Y + 8
 *   B8A5  for Y = $A9 down to 0: fill bullet $A0[Y] and give it a velocity
 *         through `$BD2C` with A = $40 and ($99:$9A) = ($B8E9[Y] : $B8E6[Y])
 *
 * THE THREE MUZZLE ROWS at Y = 0, 1, 2 are `$B8E6` = 00 A0 A0 (the velocity
 * fraction), `$B8E9` = 00 00 00 (the integer) and `$B8EC` = 00 01 00 (the
 * direction byte). So the middle bullet gets direction 1 and the outer two
 * direction 0 -- a spread, not three copies.
 *
 * `$B8A1 LDA #$00 / STA $99` is DEAD: `$B8AF LDA $B8E9,Y / STA $99` overwrites
 * it on the first pass of the loop and every pass after. Kept as a comment.
 */
function fireB7A1(state, rom, j) {
  const o = state.obj; const i = j + ENEMY_BASE;
  if (o.s0480[i] !== 0) {                // $B85A LDA $048C,X / $B85D BEQ $B868
    o.s0480[i] = 0;                      // $B85F LDA #$00 / $B861 STA $048C,X
    o.yvel[i] = 0;                       // $B864 STA $03BC,X
    return;                              // $B867 RTS
  }
  o.s0480[i] = 1;                        // $B868 LDA #$01 / $B86A STA $048C,X
  o.yvel[i] = 1;                         // $B86D STA $03BC,X
  const slots = [0x80, 0x80, 0x80];      // $B870 LDA #$80 / STA $A0/$A1/$A2
  let n = 0;                             // $B87A LDX #$00
  for (let y = 9; y >= 0; y--) {         // $B878 LDY #$09 / $B88A BPL $B87C
    if (o.anim[22 + y] !== 0) continue;  // $B87C LDA $0136,Y / $B87F BNE $B889
    slots[n] = y;                        // $B881 TYA / $B882 STA $A0,X
    n += 1;                              // $B884 INX
    if (n >= 3) break;                   // $B885 CPX #$03 / $B887 BCS $B88C
  }
  n -= 1;                                // $B88C DEX
  if (n < 0) return;                     // $B88D BPL $B890 / $B88F RTS
  const bx = o.x[i];                     // $B892 LDY $A8 / $B894 LDA $036C,Y
  const by = u8(o.y[i] + 8);             // $B899 LDA $032C,Y / CLC / ADC #$08
  // $B8A1 LDA #$00 / STA $99 -- dead, see the header.
  for (let y = n; y >= 0; y--) {         // $B8A5 LDY $A9 / $B8E1 DEC / $B8E3 BPL
    const k = 22 + slots[y];             // $B8A7 LDX $A0,Y -- the bullet slot
    o.s0460[k] = rom.read(0xB8EC + y);   // $B8A9 LDA $B8EC,Y / $B8AC STA $0476,X
    const hi = rom.read(0xB8E9 + y);     // $B8AF LDA $B8E9,Y / STA $99
    const lo = rom.read(0xB8E6 + y);     // $B8B4 LDA $B8E6,Y / STA $9A
    o.x[k] = bx;                         // $B8B9 LDA $A3 / $B8BB STA $0376,X
    o.y[k] = by;                         // $B8BE LDA $A4 / $B8C0 STA $0336,X
    o.animFrame[k] = 1;                  // $B8C3 LDA #$01 / $B8C5 STA $0176,X
    o.type[k] = 2;                       // $B8C8 LDA #$02 / $B8CA STA $0316,X
    o.anim[k] = 0x7A;                    // $B8CD LDA #$7A / $B8CF STA $0136,X
    o.status[k] = 1;                     // $B8D2 LDA #$01 / $B8D4 STA $0116,X
    // $B8D7 TXA / CLC / ADC #$0A / TAX -- the SAME byte, addressed as $044C,X
    // with X = slot + $0A instead of $0476,X with X = slot. k is both.
    loc_BD2C(state, k, 0x40, hi, lo);    // $B8DC LDA #$40 / $B8DE JSR $BD2C
  }
}                                        // $B8E5 RTS

/**
 * `loc_$B502` -- entry 28's init, and the body `$B559` (entry 29, stage 5)
 * shares via `$B55C BPL $B502`. Ported here so W32 does not re-derive it.
 */
function loc_B502(state, j) {
  const o = state.obj; const i = j + ENEMY_BASE;
  setInitialised(state, j);              // $B502 JSR $B0B4
  o.s0480[i] = 0x80;                     // $B505 LDA #$80 / STA $048C,X
  o.s04A0[i] = 0x14;                     // $B50A LDA #$14 / STA $04AC,X
}

// ==================== WAVE 32a: ENTRY 29, $B559 =============================
//
// SPAN `$B559`-`$B568`, 16 bytes, 6 instructions. Stage 5 (`$19 = 4`) only:
// type `$1D` is the FIRST record of stage 5's chunk 0 (`$ABB6`) and the type of
// TEN of that stage's 28 distinct wave records -- every one of them in chunks 0
// and 1, i.e. the whole of scroll `$0000`-`$047F`.
//
//   B559  BD 0C 03  LDA $030C,X
//   B55C  10 A4     BPL $B502          <- BACKWARD, 87 bytes, into $B4FD's body
//   B55E  A0 09     LDY #$09
//   B560  20 28 B6  JSR $B628          the shared animator, row 9
//   B563  DE 6C 03  DEC $036C,X        one pixel left, every frame
//   B566  4C 51 B2  JMP $B251          the off-screen box (may FREE the slot)
//
// READING PAST THE APPARENT END, and the three things it settles:
//
//  * `$B566` is a `JMP`, so nothing falls out of `$B559`. `$B569` is `st_B569`
//    (entry 30, stage 7's handler) and its only xref is `$AE19`, the dispatch --
//    it is never fallen into. So the routine really is 16 bytes.
//  * `$B55C BPL $B502` is a BACKWARD branch into the MIDDLE of entry 28
//    (`$B4FD`), which begins 92 bytes earlier. `loc_B502` was already factored
//    out by W30/W31 for exactly this, so this wave re-uses it and does not
//    re-transcribe it. That is the fall-through family's shape again (the
//    fifteenth incident on this project), caught in advance this time.
//  * `sub_B628` with Y = 9 reads `$B659`/`$B65A`/`$B65B` = threshold `$08`,
//    base `$52`, count `$06`. `$B650`'s table is TWELVE bytes ($B650-$B65B) and
//    `$B65C` is code (`loc_B65C`), so Y = 9 is the LAST row that fits and there
//    is no overrun. Metasprites `$52`-`$57`; all six are in the export.
//
// `loc_B502` WRITES TWO FIELDS THIS HANDLER NEVER READS. `$048C` (accel, $80)
// and `$04AC` ($14) exist for `$B4FD`'s four-phase machine; `$B559`'s body is
// only animate + move + box. They are transcribed because the cartridge writes
// them and they are observable in RAM, not because they do anything here.
//
// `$B566 JMP $B251` CAN FREE THE SLOT. Unlike `$B4FD` (whose `$B518` is a `JSR`
// and which then keeps running on a freed slot) this is a tail jump, so nothing
// follows it -- the one place `$B559` is SIMPLER than the body it shares.

/**
 * Entry 29, `$B559` (types `$1D`/`$9D`) -- stage 5's chunk-0/1 drifter.
 */
function h_B559(state, rom, j) {
  const o = state.obj; const i = j + ENEMY_BASE;
  if (!(o.type[i] & 0x80)) return loc_B502(state, j);   // $B559/$B55C BPL $B502
  sub_B628(state, rom, j, 9);            // $B55E LDY #$09 / $B560 JSR $B628
  o.x[i] = u8(o.x[i] - 1);               // $B563 DEC $036C,X
  offScreenCheck(state);                 // $B566 JMP $B251 -- may free the slot
}

// ================ WAVE 30: ENTRY 22, $C906 -- THE MOAI ======================
//
// THREE ROM REGIONS, not one, and the trap is that they are NOT contiguous and
// the continuation sits BEFORE the entry point:
//
//   $C906-$CA28   st_C906, the per-frame body
//   $C77C-$C821   loc_C77C, THE DESTROYED CONTINUATION -- reached by
//                 `$C916 JMP $C77C`, which nothing returns to, and which lives
//                 130 bytes EARLIER in the ROM. Read past the apparent end.
//   $C822-$C87A   sub_C822, its collision-map eraser
//
// WHAT $0700 IS. `$C9C0 STA $0700,Y` with `Y = $0E` is the ORDINARY VRAM QUEUE
// (src/vram.js), not a new substrate: `$0E` is the queue's byte cursor and
// `$8A51` is the drainer. 28-recon-stages-2-7.md calls it a "plasma-ring
// buffer"; it is the same page the terrain streamer and the HUD append to, and
// `$C920 LDA $0E / CMP #$04 / BCS $C935` is the SAME four-byte gate `$9D87` and
// `$889A` use. So the moai simply refuses to open or close on a frame when
// anything else has already queued.
//
// WHERE THE MOAI'S NAMETABLE ADDRESS LIVES: `$03BC:$03EC` (the Y-velocity pair,
// reused), planted by `$A46F` straight out of the inline-5 record's bytes 3
// and 4. That is why the moai has no wave-record TYPE of its own.
//
// THE WARP. `$C784 LDA #$01 / STA $39` fires when `$5F` reaches $0A -- TEN
// moai destroyed opens the stage-3 warp, and `$39` is the same flag W27's
// `$9930` route already consumes. It is a STORE of 1, not the `INC $39` the
// hatches and the boss use.

/**
 * Entry 22, `$C906` (types `$16`/`$96`) -- stage 3's moai, and the only
 * consumer of the inline-5 route's `$A46F` arm.
 *
 *   C906  LDX $A8
 *   C908  LDA $010C,X / AND #$0F / STA $A9      the VARIANT, 0..3 (from the cmd)
 *   C90F  LDA $046C,X / CMP #$03 / BCS $C916    three hits -> JMP $C77C
 *   C919  JSR $AEDD                              drift left, free below X = 8
 *   C91C  LDA $5D / BNE $C935                    a wave record fired -> not now
 *   C920  LDA $0E / CMP #$04 / BCS $C935         the queue is busy -> not now
 *   C926  LDA $04AC,X / BNE $C932                the reopen timer -> DEC and RTS
 *   C92B  LDA $048C,X / BEQ $C95A                closed -> the proximity test
 *         (else)                     $C93D       open   -> close
 */
function h_C906(state, rom, j) {
  const o = state.obj; const i = j + ENEMY_BASE;
  const variant = o.status[i] & 0x0F;    // $C908 LDA $010C,X / AND #$0F / STA $A9
  if (o.s0460[i] >= 3) return loc_C77C(state, rom, j, variant);   // $C90F/$C916
  h_AEDD(state);                         // $C919 JSR $AEDD (drift; may free)
  if (state.spawn.z5D !== 0) return;     // $C91C LDA $5D / $C91E BNE $C935
  if (state.vram.cursor >= 0x04) return; // $C920 LDA $0E / CMP #$04 / BCS $C935
  if (o.s04A0[i] !== 0) {                // $C926 LDA $04AC,X / $C929 BNE $C932
    o.s04A0[i] = u8(o.s04A0[i] - 1);     // $C932 DEC $04AC,X
    return;                              // $C935 RTS
  }
  if (o.s0480[i] === 0) return moaiTryOpen(state, rom, j, variant);   // $C92E BEQ
  // loc_C93D -- CLOSE. The tile set is the OPEN one plus $10.
  o.s0480[i] = 0;                        // $C93D LDA #$00 / $C93F STA $048C,X
  o.s0460[i] = 0;                        // $C942 STA $046C,X   (the hit count!)
  o.s04E0[i] = 0;                        // $C945 STA $04EC,X
  o.s04A0[i] = rom.read(0xC936 + state.zp17);   // $C948 LDY $17 / LDA $C936,Y
  moaiQueue(state, rom, j, variant, u8(variant * 4 + 0x10));   // $C950-$C957
}

/**
 * `loc_$C95A` -- the proximity test that OPENS the moai. Four arms, chosen by
 * the variant `$A9`, each comparing the ship's `$0360`/`$0320` against the
 * moai's own position with a $0A slack.
 *
 * THE VARIANT-1 / VARIANT-3 BRANCH IS EASY TO GET BACKWARDS: `$C968 DEY /
 * $C969 BEQ $C973` sends variant ONE to `$C973` (the SBC arm) and lets
 * variant THREE fall into `$C96B` (the ADC arm), not the other way round.
 *
 *   $A9 = 0  ship X +$0A >= moai X  AND  ship Y -$0A <  moai Y     ($C98D)
 *   $A9 = 1  ship Y -$0B >= moai Y                                 ($C973)
 *   $A9 = 2  ship X -$0A >= moai X  AND  ship Y -$0A <  moai Y     ($C97B)
 *   $A9 = 3  ship Y +$0B <  moai Y                                 ($C96B)
 *
 * THE $0B IS NOT A TYPO AND IS THE WHOLE REASON THE FLAGS ARE TRACKED. The
 * carry each ADC/SBC consumes is whatever the preceding compare left:
 *   $C98D  carry CLEAR ($C922 CMP #$04's BCS was NOT taken)         -> +$0A
 *   $C97B  carry SET   ($C961 CPY #$02 with Y = 2, equal)           -> -$0A
 *   $C973  carry CLEAR ($C961 CPY #$02 with Y = 1, less)            -> -$0B
 *   $C96B  carry SET   ($C961 CPY #$02 with Y >= 3, greater)        -> +$0B
 * The two second-stage `SBC #$0A`s at $C994 and $C982 both follow a CMP whose
 * BCS/BCC proved the carry SET, so those are plain subtracts.
 *
 * Only variants 0-3 exist: the 45 stage-3 inline-5 records carry cmd $F0-$F3
 * ONLY (14 / 19 / 9 / 3 of them), measured off assets/prg.bin with the same
 * decoder wavecensus.py uses. A cmd $F4+ would index past $C893's four
 * pointers, and the exported block would throw on the read.
 */
function moaiTryOpen(state, rom, j, variant) {
  const o = state.obj; const i = j + ENEMY_BASE;
  let open = false;
  if (variant === 0) {                   // $C95F BEQ $C98D
    // loc_C98D: ADC #$0A with the carry CLEAR -- see the header.
    if (u8(state.obj.x[0] + 0x0A) >= o.x[i]) {   // $C98D / $C98F CMP $036C,X / BCS
      open = u8(state.obj.y[0] - 0x0A) < o.y[i]; // $C994-$C99C
    }
  } else if (variant === 2) {            // $C961 CPY #$02 / $C963 BEQ $C97B
    // loc_C97B: SBC #$0A with the carry SET.
    if (u8(state.obj.x[0] - 0x0A) >= o.x[i]) {   // $C97D CMP $036C,X / $C980 BCC RTS
      open = u8(state.obj.y[0] - 0x0A) < o.y[i]; // $C982-$C98A
    }
  } else if (variant === 1) {            // $C968 DEY / $C969 BEQ $C973
    // loc_C973: SBC #$0A with the carry CLEAR -> minus $0B.
    open = u8(state.obj.y[0] - 0x0B) >= o.y[i];  // $C975 CMP $032C,X / $C978 BCS
  } else {
    // loc_C96B: ADC #$0A with the carry SET -> plus $0B.
    open = u8(state.obj.y[0] + 0x0B) < o.y[i];   // $C96D CMP $032C,X / $C970 BCC
  }
  if (!open) return;                     // $C972/$C97A/$C98C/$C99E RTS
  // loc_C99F -- OPEN.
  state.spawn.z5D = u8(state.spawn.z5D + 1);    // $C99F INC $5D
  o.style[i] = 0;                        // $C9A1 LDA #$00 / $C9A3 STA $040C,X
  o.s04E0[i] = 0x14;                     // $C9A8 LDA #$14 / $C9AA STA $04EC,X
  o.s0480[i] = 0x14;                     // $C9AD STA $048C,X
  o.s04A0[i] = rom.read(0xC936 + state.zp17);   // $C9A6 LDY $17 / $C9B0 LDA $C936,Y
  moaiQueue(state, rom, j, variant, u8(variant * 4));   // $C9B6 ASL / ASL
}

/**
 * `loc_$C9BA` -- append the moai's mouth tiles to the VRAM queue.
 *
 * One packet of two tiles at the moai's own nametable address, and -- when the
 * row's third byte `$CA2B[$AA]` is ZERO -- a SECOND packet one row below (+$20)
 * carrying `$CA2C[$AA]`. `$AA` is `variant * 4` for the OPEN set and
 * `variant * 4 + $10` for the CLOSED one, so the table at `$CA29` is eight rows
 * of four: four variants open, then the same four closed.
 *
 *   C9BA  STA $AA
 *   C9BC  LDA #$01 / LDY $0E / STA $0700,Y / INY       packet mode 1
 *   C9C4  LDA $03BC,X / STA $0700,Y / INY              address HIGH
 *   C9CB  LDA $A9 / CMP #$02 / BNE $C9DA
 *   C9D1  LDA $03EC,X / SEC / SBC #$01                 variant 2 sits one left
 *   C9DA  LDA $03EC,X                                  address LOW
 *   C9E1  LDX $AA / LDA $CA29,X / ... / $CA2A,X / ... / LDA #$FF   two tiles + end
 *   C9F7  LDA $CA2B,X / BNE $CA26                      non-zero -> done
 *   C9FC  ...the second packet, at (address + $20), one tile from $CA2C,X
 *   CA26  STY $0E / RTS
 */
function moaiQueue(state, rom, j, variant, aa) {
  const o = state.obj; const i = j + ENEMY_BASE;
  const hi = o.yvel[i];                  // $C9C4 LDA $03BC,X -- the NT addr high
  const lo = (variant === 2)             // $C9CB LDA $A9 / CMP #$02 / BNE $C9DA
    ? u8(o.yvelf[i] - 1)                 // $C9D1 LDA $03EC,X / SEC / SBC #$01
    : o.yvelf[i];                        // $C9DA LDA $03EC,X
  queueByte(state, 0x01);                // $C9BC LDA #$01 / $C9C0 STA $0700,Y
  queueByte(state, hi);                  // $C9C7 STA $0700,Y
  queueByte(state, lo);                  // $C9DD STA $0700,Y
  queueByte(state, rom.read(0xCA29 + aa));      // $C9E3 LDA $CA29,X
  queueByte(state, rom.read(0xCA2A + aa));      // $C9EA LDA $CA2A,X
  queueByte(state, 0xFF);                // $C9F1 LDA #$FF / $C9F3 STA $0700,Y
  if (rom.read(0xCA2B + aa) !== 0) return;      // $C9F7 LDA $CA2B,X / $C9FA BNE
  queueByte(state, 0x01);                // $C9FC LDA #$01 / $C9FE STA $0700,Y
  // $CA02 LDX $A8 -- back to the moai's own slot for the +$20 row. The ROM
  // writes the LOW byte at $0701,Y and the HIGH at $0700,Y and then INYs twice,
  // so on the wire the pair is [high][low], the same order as above.
  const lo2 = o.yvelf[i] + 0x20;         // $CA04 LDA $03EC,X / CLC / ADC #$20
  queueByte(state, u8(o.yvel[i] + (lo2 > 0xFF ? 1 : 0)));   // $CA0D ADC #$00
  queueByte(state, u8(lo2));             // $CA0A STA $0701,Y
  queueByte(state, rom.read(0xCA2C + aa));      // $CA19 LDA $CA2C,X
  queueByte(state, 0xFF);                // $CA20 LDA #$FF
}                                        // $CA26 STY $0E / $CA28 RTS

/**
 * `loc_$C77C` -- THE DESTROYED CONTINUATION. `$C916 JMP $C77C` is the only way
 * in, nothing returns to it, and it sits 394 bytes BEFORE `st_C906` in the ROM.
 *
 *   C77C  INC $5F / LDA $5F / CMP #$0A / BCC $C788
 *   C784  LDA #$01 / STA $39            TEN moai -> the stage-3 WARP
 *   C788  INC $5D
 *   C78A  JSR $844F                     +$0300
 *   C78D  JSR $C822                     erase the moai's collision cells
 *   C790  LDX $A8 / $98 := $03EC,X / $99 := $03BC,X    the NT address, lo:hi
 *   C79C  LDA #$0C / JSR $CB26          sound $0C, then $CB2B: become explosion 2
 *   C7A1  $A9 := $A9 * 2 / LDX $A9 / $9A:$9B := $C893[X]   the rubble stream
 *   C7B2  build packets until the stream's $FF-after-$FE terminator
 *   C81F  STX $0E / RTS
 *
 * THE STREAM FORMAT, read out of $C7BC-$C821 (four streams, at $C89B, $C8F1,
 * $C8BD and $C8E0, all inside the exported `stage2Object` block):
 *
 *   [offset]  packet address := ($99:$98) MINUS offset      (the $C7BC arm)
 *   [tiles..] appended verbatim
 *   $FF       end this packet ($FF on the wire, then a mode $01) and read
 *             another offset -- back to $C7BC
 *   $FE       end this packet, then switch ONCE to the $C7EE arm, whose next
 *             offset is ADDED instead of subtracted, and whose packet ends at
 *             the next $FF -- which also ends the whole stream
 *
 * It terminates because every stream has exactly one $FE and one final $FF.
 */
function loc_C77C(state, rom, j, variant) {
  const o = state.obj; const i = j + ENEMY_BASE;
  state.zp5F = u8(state.zp5F + 1);       // $C77C INC $5F
  if (state.zp5F >= 0x0A) state.zp39 = 1;// $C784 LDA #$01 / STA $39 -- THE WARP
  state.spawn.z5D = u8(state.spawn.z5D + 1);   // $C788 INC $5D
  addScore(state, 0x00, 0x03, 0x00);     // $C78A JSR $844F ($9A := 3) -- +$0300
  sub_C822(state, rom, j, variant);      // $C78D JSR $C822
  const lo = o.yvelf[i];                 // $C792 LDA $03EC,X / STA $98
  const hi = o.yvel[i];                  // $C797 LDA $03BC,X / STA $99
  soundRequest(state, 0x0C);             // $C79C LDA #$0C / $C79E JSR $CB26
  explodeInPlace(state, j);              // $CB2B
  const ptr = rom.word(0xC893 + variant * 2);  // $C7A1 ASL / $C7A8 LDA $C893,X
  let y = 0;                             // $C7B4 LDY #$00
  queueByte(state, 0x01);                // $C7B2 LDA #$01 / $C7B8 STA $0700,X
  for (;;) {
    // loc_C7BC: the address = ($99:$98) - stream[y], 16-bit, written [hi][lo].
    const d = lo - rom.read(u16(ptr + y)); y += 1;      // $C7BF SBC ($9A),Y
    queueByte(state, u8(hi - (d < 0 ? 1 : 0)));         // $C7C4 LDA $99 / SBC #$00
    queueByte(state, u8(d));                            // $C7C1 STA $0701,X
    let b;
    for (;;) {                           // loc_C7CE
      b = rom.read(u16(ptr + y)); y += 1;
      if (b === 0xFF || b === 0xFE) break;              // $C7D1 / $C7D5
      queueByte(state, b);                              // $C7D9 STA $0700,X
    }
    queueByte(state, 0xFF);              // $C7E0/$C7EE LDA #$FF
    queueByte(state, 0x01);              // $C7E6/$C7F4 LDA #$01 -- the next mode
    if (b === 0xFE) break;               // $C7D7 BEQ $C7EE -- the ADD arm, once
    // $C7EC BNE $C7BC -- always taken (A = 1), so a $FF starts another packet.
  }
  // loc_C7EE's tail: this one offset is ADDED, and its packet ends the stream.
  const s = lo + rom.read(u16(ptr + y)); y += 1;        // $C7FD CLC / ADC ($9A),Y
  queueByte(state, u8(hi + (s > 0xFF ? 1 : 0)));        // $C802 LDA $99 / ADC #$00
  queueByte(state, u8(s));                              // $C7FF STA $0701,X
  for (;;) {                             // loc_C80C
    const b = rom.read(u16(ptr + y));
    if (b === 0xFF) break;               // $C80E CMP #$FF / $C810 BEQ $C819
    y += 1;                              // $C812 INY
    queueByte(state, b);                 // $C813 STA $0700,X
  }
  queueByte(state, 0xFF);                // $C819 LDA #$FF / $C81B STA $0700,X
}                                        // $C81F STX $0E / $C821 RTS

/**
 * `sub_$C822` -- erase the destroyed moai's cells from the TERRAIN COLLISION
 * MAP at `$0500`-`$06FF` (the port's `state.coll`, written by the terrain
 * streamer's `$9F7F` and read by `$C3D3`).
 *
 * The pointer is derived from the moai's own nametable address:
 *
 *   C822  LDX $A8 / LDA $03BC,X / STA $98          $98 := NT addr HIGH
 *   C829  LDY #$05 / AND #$04 / BEQ $C831 / LDY #$06
 *   C831  STY $9B                                  page $05 or $06, by bit 2
 *   C833  LDA $03EC,X / STA $99                    A := NT addr LOW
 *   C838  ASL A / ROL $98                          a 16-bit <<1 of ($98:A)
 *   C83B  ASL A / ASL A / AND #$F8 / STA $9A       so $9A := (low << 3) AND $F8
 *   C841  LDA $98 / AND #$07 / ORA $9A / STA $9A   ...OR the three carried bits
 *
 * then, by variant: 0 writes `$0F` at the five offsets `$C87B[0..4]` and `$00`
 * at `$C87B[6..10]`; 2 subtracts $29 from the pointer LOW BYTE ONLY and uses
 * rows `$C87B[12..16]` / `$C87B[18..22]`. Variants 1 and 3 do NOTHING
 * (`$C853 RTS`) -- they are the moai's other halves and share a cell block.
 */
function sub_C822(state, rom, j, variant) {
  const o = state.obj; const i = j + ENEMY_BASE;
  const ntHi = o.yvel[i];                // $C824 LDA $03BC,X / $C827 STA $98
  const page = (ntHi & 0x04) ? 6 : 5;    // $C82B AND #$04 / $C82D BEQ / LDY #$06
  const ntLo = o.yvelf[i];               // $C833 LDA $03EC,X / $C836 STA $99
  const rolled = u8((ntHi << 1) | (ntLo >> 7));         // $C838 ASL A / ROL $98
  let p = ((u8(ntLo << 3) & 0xF8) | (rolled & 0x07));   // $C83B-$C847
  // $C84B LDA $A9 / BEQ $C854 / CMP #$02 / BEQ $C86F / $C853 RTS
  let x;
  if (variant === 0) x = 0;              // loc_C854 LDX #$00
  else if (variant === 2) {              // loc_C86F
    x = 0x0C;                            // $C86F LDX #$0C
    p = u8(p - 0x29);                    // $C871 LDA $9A / SEC / SBC #$29 -- the
                                         //   LOW byte only; $9B is untouched
  } else return;                         // $C853 RTS
  const base = (page << 8) | p;
  // loc_C856: $0F at every offset until the $FF, then $00 at every offset of
  // the NEXT run until its $FF. `$C862 INX` steps past the first run's $FF.
  let a = 0x0F;                          // $C856 LDA #$0F
  for (;;) {
    const off = rom.read(0xC87B + x);    // $C858/$C865 LDY $C87B,X
    if (off & 0x80) {                    // $C85B/$C868 BMI
      if (a === 0x00) return;            // $C86E RTS -- the second run is done
      a = 0x00;                          // $C862 INX / $C863 LDA #$00
      x += 1;
      continue;
    }
    collWrite(state, base + off, a, j, variant);        // $C85D/$C86A STA ($9A),Y
    x += 1;                              // $C85F/$C862 INX
  }
}

/**
 * `STA ($9A),Y` out of `sub_$C822`. The pointer is a REAL 16-bit pointer plus Y,
 * so it can leave the two collision-map pages; it is not masked to one page.
 * A write outside `$0500`-`$06FF` would land on the VRAM queue ($0700) or on
 * the object arrays ($0400), neither of which `state.coll` models -- so it is a
 * loud named throw rather than a silently clamped write. It has NOT been
 * measured either way; this is the tripwire, not an absence proof.
 */
function collWrite(state, addr, v, j, variant) {
  if (addr < 0x0500 || addr > 0x06FF) {
    throw new Error(`$C85D STA ($9A),Y wrote $${addr.toString(16).toUpperCase()}`
                  + `, outside the $0500-$06FF collision map (moai slot ${j}, `
                  + `variant ${variant}). The port models only those two pages; `
                  + 'the cartridge would write $0700 (the VRAM queue) or $0400 '
                  + '(the object arrays) here.');
  }
  state.coll[addr - 0x0500] = v;
}

/**
 * `$B1FA` -- X -= xvel (16-bit), then FALL THROUGH into `$B1F4`, which is
 * `$B1F1`'s tail. So it is `arcRightDown` with `subX16` in place of `addX16`.
 *
 *   B1FA  JSR $B184     subX16
 *   B1FD  JMP $B1F4     -> JSR $B16C (addY16) / $B1F7 JMP $B1EB (velSubAccel)
 *                          / $B1EE JMP $B251 (the box)
 */
function loc_B1FA(state, j) {
  subX16(state, j);                      // $B1FA JSR $B184
  addY16(state, j);                      // $B1F4 JSR $B16C
  velSubAccel(state, j);                 // $B1F7 JMP $B1EB -> JSR $B120
  offScreenCheck(state);                 // $B1EE JMP $B251
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
 * `$CB2B` is also reached from `$CB69` (the arm pool's free-on-death, W32b) and
 * from `$BF6F JSR $CB28` with `LDA #$0C / LDX #$00` (a shot destroying an arm,
 * W32c, src/collision.js) -- which is why this is exported.
 */
export function explodeInPlace(state, j) {
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
 * Handler 10, `$B36F` -- THE VOLCANO PROJECTILE, types $0A/$8A. The only enemy
 * with ZERO wave-script records anywhere: `$C486` (the late spawner's stage-1
 * arm) is its sole producer. MEASURED 6,365 executions of `$B36F` over the
 * endchain run (first@1339, the start of the `$82` countdown).
 *
 * First frame: bit 7 of the type is clear (`$C486` writes the raw `$0A`), so
 * the BPL is taken -> `loc_$B3A7 JMP $B0B4` sets the initialised bit. Every
 * frame after: `JMP $B1E5` -- the ballistic arc:
 *   $B1E5 JSR $B184  subX16     (X -= xvel, 16-bit; constant sideways velocity)
 *   $B1E8 JSR $B140  subY16     (Y -= yvel, 16-bit)
 *   $B1EB JSR $B120  velSubAccel (yvel:frac -= accel -- GRAVITY on Y)
 *   $B1EE JMP  $B251  offScreenCheck (free when it leaves the box)
 *
 * The arc is parabolic: X velocity is constant, Y velocity has gravity. The
 * two crater positions ($38/$B8) and the per-spawn (xvel,yvel,accel) come from
 * `st_$C486`'s tables. `$A8` is reloaded at `$B251` -- offScreenCheck reads it
 * from state.spawn.zA8 rather than trusting the caller's `j`, so both are kept
 * in sync (the update loop sets zA8 = j before dispatch).
 */
function h_B36F(state, j) {
  const o = state.obj; const i = j + ENEMY_BASE;
  if (!(o.type[i] & 0x80)) {             // $B36F LDA $030C,X / $B372 BPL $B3A7
    return setInitialised(state, j);      // $B3A7 JMP $B0B4 (first frame only)
  }
  // $B374 4C E5 B1 JMP $B1E5 -- the arc. All four pieces are shared (ported in
  // prior waves): subX16 ($B184), subY16 ($B140), velSubAccel ($B120) and
  // offScreenCheck ($B251). The fall-through chain $B1E5->$B1E8->$B1EB is real
  // in the ROM (loc_ labels, not separate JSRs past the first).
  subX16(state, j);                       // $B1E5 JSR $B184
  subY16(state, j);                       // $B1E8 JSR $B140
  velSubAccel(state, j);                  // $B1EB JSR $B120
  offScreenCheck(state);                  // $B1EE JMP  $B251
}

/**
 * Handler 21, `$B377` -- THE CEILING VOLCANO'S ROCK, types `$15`/`$95`.
 * `st_$C5AD` (stage 4's late-spawner arm) is its ONLY producer: no wave record
 * anywhere in the 598 names type `$15`, exactly as no record names the stage-1
 * volcano's `$0A`.
 *
 *   B377  BD 0C 03      LDA $030C,X
 *   B37A  10 2B         BPL $B3A7   -> JMP $B0B4, type += $80 (the init frame)
 *   B37C  4C FA B1      JMP $B1FA
 *
 * `$B36F` and `$B377` are the same routine with ONE address changed, and that
 * address is the whole difference between the two stages' eruptions:
 *
 * | | `$B36F` (type $0A) | `$B377` (type $15) |
 * |---|---|---|
 * | arc | `$B1E5` -> `$B184` `$B140` `$B120` `$B251` | `$B1FA` -> `$B184` `$B16C` `$B120` `$B251` |
 * | Y | `subY16` -- the rock flies UP off the crater | `addY16` -- it falls DOWN off the ceiling |
 *
 * Both arms already existed in this port: `setInitialised` since W12 and
 * `loc_B1FA` since W30 (it was factored out for `$B434`'s `$B459 JMP $B1FA`).
 * `$B37C` is a JMP, so `$B37F` (entry 11, the jellyfish) is NOT fallen into.
 */
function h_B377(state, j) {
  const o = state.obj; const i = j + ENEMY_BASE;
  if (!(o.type[i] & 0x80)) {              // $B377 LDA $030C,X / $B37A BPL $B3A7
    return setInitialised(state, j);       // $B3A7 JMP $B0B4 (first frame only)
  }
  loc_B1FA(state, j);                      // $B37C JMP $B1FA
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

/**
 * Handler 11, `$B37F` -- THE JELLYFISH, types $0B/$8B. Stage 2's signature
 * enemy (the only stage-2 handler that was missing). Produced by `$C546` (the
 * stage-2 late-spawner arm) as type $0B; `$B0B4` flips it to $8B once its
 * morph-in finishes. Reused by stage 7 (9 records) -- FREE there (W34).
 *
 * TWO FORMS, selected by bit 7 of the type byte (same slot, same handler):
 *
 *   $0B (BMI NOT taken) -- the MORPH-IN. INCs `$04AC,X`, indexes the 9-entry
 *   anim table at `$B3C2` by `$04AC >> 2`, so `$64` for 12 frames, `$65` for
 *   12, `$66` for 12. At index 8 (frame ~32) it transitions: `$04CC := 1`,
 *   `$048C := 0`, then `JMP $B0B4` sets the initialised bit -> type becomes
 *   $8B next frame. The `$04CC != 0` early-out at the top is the defensive
 *   re-init (a `$0B` that somehow still has `$04CC` set re-asserts the flip).
 *
 *   $8B (BMI taken) -- the ACTIVE form. anim `$67`. On its FIRST frame only
 *   (`$048C == 0`) it calls `$BCB5` with A = `$A8` = the enemy's own index,
 *   which AIM is the enemy itself at the ship (aimBullet writes the enemy's
 *   velocity/direction, NOT a bullet's -- see the $B37F recon in the W29
 *   worklog). Then `$BDFA` (moveAimedEnemy) flies it along that velocity, and
 *   `$048C := 1` so it never re-aims: the jellyfish picks a straight course
 *   toward where the ship WAS on its first active frame.
 *
 * Span `$B37F`-`$B3C1` + the table at `$B3C2`; NO fall-out (the RTS at $B3C1
 * precedes the data; `st_B3CB` is the next routine). Recon: 29-impl-stage2.md.
 */
function h_B37F(state, rom, j) {
  const o = state.obj; const i = j + ENEMY_BASE;
  if (!(o.type[i] & 0x80)) {                  // $B37F LDA $030C,X / $B382 BMI $B3AA
    // The $0B morph-in form.
    if (o.s04C0[i] !== 0) {                   // $B384 LDA $04CC,X / $B387 BNE $B39D
      o.s04C0[i] = 0x01;                      // loc_B39D: $04CC := 1
      o.s0480[i] = 0;                         // loc_B3A2: $048C := 0
      return setInitialised(state, j);        // loc_B3A7 JMP $B0B4 ($0B -> $8B)
    }
    o.s04A0[i] = u8(o.s04A0[i] + 1);          // $B389 INC $04AC,X
    const y = o.s04A0[i] >>> 2;               // $B38C/$B38F/$B390 LSR/LSR/TAY
    o.anim[i] = rom.read(0xB3C2 + y);         // $B392 LDA $B3C2,Y / STA $012C,X
    if (y === 8) {                            // $B398 CPY #$08 / $B39A BEQ $B39D
      o.s04C0[i] = 0x01;                      // loc_B39D
      o.s0480[i] = 0;                         // loc_B3A2
      return setInitialised(state, j);        // loc_B3A7 JMP $B0B4
    }
    return;                                   // $B39C RTS (still morphing, $0B)
  }
  // loc_B3AA: the $8B initialised form.
  o.anim[i] = 0x67;                           // $B3AA LDA #$67 / STA $012C,X
  if (o.s0480[i] === 0) {                     // $B3AF LDA $048C,X / $B3B2 BNE $B3B9
    aimBullet(state, j);                      // $B3B4 LDA $A8 / $B3B6 JSR $BCB5
  }                                          //   -- A=$A8=j aims the ENEMY at the ship
  moveAimedEnemy(state, j);                   // $B3B9 JSR $BDFA
  o.s0480[i] = 1;                             // $B3BC LDA #$01 / STA $048C,X
}

// ============================ WAVE 26: THE BOSS =============================
// `$B914` head + `$B913` inert body. Recon: docs/worklog/gradius/26-recon-boss.md
// (read it first). The boss is a single per-frame handler on slot 9 (enemy index
// 9, type $98) with two inert body slots (indices 8 and 7, type $99) it syncs
// every frame, plus a 4-bullet armament it re-positions on each fire cycle.
//
// ADDRESSING. The boss mixes THREE indexing conventions inside one routine, and
// getting them apart is the whole difficulty:
//
//   +$0C (enemy-relative)  `$046C,X` with X = enemy index writes slot X+12.
//                          This is the convention every other handler uses.
//   +$0B (slot-N-1 trick)  `$030B,X` writes `$030C+(X-1)`, i.e. the PREVIOUS
//                          slot. How both body slots get written from one
//                          subroutine (sub_B9F2 runs twice: X=9 then X=8).
//   overflow / +$0A..+$0F  the body-sync sub_B9B7 writes `$045E,X`/`$045F,X`
//                          which with X=9 land at `$0467`/`$0468` -- s0460[7]/[8]
//                          (shot slots), NOT the body. And `$0460,X` (NO +$0C)
//                          at $B925 writes s0460[X] = the missile-damage flag at
//                          enemy index 9, distinct from the HP at `$046C,X`.
//
// Resolving by RAW address (base+X) is the only way to be byte-exact across all
// three conventions, and every object byte for slots 7..25 IS a compared field
// (1022-address watch list). The resolver below mirrors porttrace.mjs `peek`
// range-for-range, including the $03A0/$03B0 carrier/yvel split.

const BOSS_OBJ_RANGES = [
  [0x0100, 0x0120, 'status'], [0x0120, 0x0140, 'anim'], [0x0140, 0x0160, 'timer'],
  [0x0160, 0x0180, 'animFrame'], [0x0180, 0x01A0, 'attrMask'],
  [0x0300, 0x0320, 'type'], [0x0320, 0x0340, 'y'], [0x0340, 0x0360, 'yf'],
  [0x0360, 0x0380, 'x'], [0x0380, 0x03A0, 'xf'],
  [0x03A0, 0x03B6, 'carrier'], [0x03B6, 0x03D0, 'yvel'],   // split, see peek
  [0x03E0, 0x0400, 'yvelf'], [0x0400, 0x0420, 'style'],
  [0x0420, 0x0440, 'xvel'], [0x0440, 0x0460, 'xvelf'],
  [0x0460, 0x0480, 's0460'], [0x0480, 0x04A0, 's0480'],
  [0x04A0, 0x04C0, 's04A0'], [0x04C0, 0x04E0, 's04C0'], [0x04E0, 0x0500, 's04E0'],
];
function bossGet(state, addr) {
  const o = state.obj;
  for (const [lo, hi, name] of BOSS_OBJ_RANGES) {
    if (addr >= lo && addr < hi) {
      return name === 'yvel' ? o.yvel[addr - 0x03B0] : o[name][addr - lo];
    }
  }
  throw new Error(`boss handler: raw object address $${addr.toString(16)} `
                + 'is not in any modelled array (porting error, not a ROM gap)');
}
function bossSet(state, addr, value) {
  const o = state.obj;
  for (const [lo, hi, name] of BOSS_OBJ_RANGES) {
    if (addr >= lo && addr < hi) {
      const idx = name === 'yvel' ? addr - 0x03B0 : addr - lo;
      o[name][idx] = u8(value);
      return;
    }
  }
  throw new Error(`boss handler: raw object address $${addr.toString(16)} `
                + 'is not in any modelled array (porting error, not a ROM gap)');
}

/**
 * Entry [25], `$B913` -- the body slots (7, 8) dispatch here and DO NOTHING.
 * The body is rendered and collision-checked but executes no logic of its own;
 * every byte that makes it visible is written by the head's body-sync
 * (`sub_B9B7`/`sub_B9F2`). Confirmed inert: the listing is a single `RTS`.
 */
function h_B913() { /* $B913: 60  RTS */ }

/**
 * Entry [24], `$B914` -- the boss head, slot 9. THE per-frame boss handler.
 *
 * Three phases, all driven off the cumulative-damage counter `$046C,X` (the HP):
 *   phase 0..5  the core visibly opens one metasprite step per damage point
 *              (morph table $B8EF: $6C $6D $6E $6F $70 $71), sfx $08 + score
 *              +$50 on each step except the initial $6C;
 *   phase 6    morph reads $00 -> the death gate at $B962;
 *   phase >=7  same death gate (a safety bound; HP only reaches 6 in play).
 *
 * While alive the body runs the intro X-descent, the rank-indexed vertical
 * movement (tracking the player), the body-sync, and the fire cycle. Death is
 * the full chain: score, INC $3B, explosion->script 4 (metasprite $A2), body
 * clear, and `INC $1B` ($85 -> $86). See `bossDeath`/`bossTimeoutDeath`.
 */
function h_B914(state, rom, j) {
  const x = j;                                   // $B914 LDX $A8 -- X = 9 (head)
  // $B916 LDA $03AC,X / BPL $B920 -- loop-2 shield: clear $04EC if carrier<0
  if (bossGet(state, 0x03AC + x) & 0x80) {       // $B919 BPL $B920 (N set -> fall)
    bossSet(state, 0x04EC + x, 0x00);            // $B91B/$B91D STA $04EC,X
  }
  bossSet(state, 0x010C + x, 0x90);              // $B920 anim/status = $90 (hittable)
  bossSet(state, 0x0460 + x, 0x03);              // $B925 missile-damage flag s0460[9]=3
  bossSet(state, 0x030C + x, 0x98);              // $B92A re-assert head type $98
  const phase = bossGet(state, 0x046C + x);      // $B92F LDY $046C,X -- THE HP
  if (phase >= 0x07) { bossDeath(state, rom, x); return; }   // $B932 CPY #$07 / BCS
  const morph = rom.read(0xB8EF + phase);        // $B936 LDA $B8EF,Y
  if (morph === 0) { bossDeath(state, rom, x); return; }     // $B939 BEQ (phase 6 terminator)
  if (morph !== bossGet(state, 0x012C + x)) {    // $B93B CMP $012C,X / BEQ $B9A8
    bossSet(state, 0x012C + x, morph);           // $B940 STA $012C,X -- advance morph
    if (morph !== 0x6C) {                        // $B943 CMP #$6C / BEQ (initial: no sfx)
      addScore(state, 0x50, 0x00, 0x00);         // $B947 JSR $845B -- +$0050 per opening step
      soundRequest(state, 0x08);                 // $B94A/$B94C JSR $EC1E -- morph sfx
      // $B94F LDX $A8 / $B951 LDA $1A / BEQ $B95F -- loop-2-only arm
      if (state.zp1A !== 0) {                    // dead-but-faithful at loop 1 (zp1A=0)
        bossSet(state, 0x04EC + x, 0xFF);        // $B955 STA $04EC,X
        bossSet(state, 0x03AC + x, 0x00);        // $B95A/$B95C STA $03AC,X
      }
    }
  }
  // $B95F JMP $B9A8 -> the alive body (intro descent + rank move + fire).
  bossAliveBody(state, rom, x);
}

/**
 * `loc_B9A8` -- runs only while the boss is alive (phase < 6). The intro
 * X-descent (head X $F0 -> ~$A3), and once past it the rank movement + fire.
 * `sub_B9B7` is reached two ways: by fall-through during the intro (when X is
 * still >= $A4 and the core is not vulnerable -- it then returns straight to
 * the dispatch loop, skipping rank/fire that frame), and by JSR at $BA6B after
 * the rank movement. Both run the same body-sync; see `bodySync`.
 */
function bossAliveBody(state, rom, x) {
  // $B9A8 LDA $036C,X (head X) / CMP #$A4 / BCC $BA0A
  if (bossGet(state, 0x036C + x) >= 0xA4) {
    bossSet(state, 0x036C + x, u8(bossGet(state, 0x036C + x) - 1));   // $B9AF DEC (intro descent)
    if (bossGet(state, 0x048C + x) === 0) {      // $B9B2 LDA $048C,X / $B9B5 BNE $BA0A
      bodySync(state, x);                        // $B9B7 fall-through entry -> returns to caller
      return;                                    // (no rank/fire this frame: fall-through RTS)
    }
  }
  bossRankAndFire(state, rom, x);                // loc_BA0A
}

/**
 * `loc_BA0A`-`$BA9F` -- the Y catch-up, rank movement, body-sync and fire cycle.
 * The charge counter `$042C,X` (xvel) increments each non-firing frame; when it
 * reaches `$B90A[$17]` the boss fires (`loc_BAA0`) and resets it. The
 * volley/vulnerability/timeout ladder on `$04AC`/`$04CC`/`$048C` runs in the
 * non-firing tail: the core is damageable only while `$04CC` in [1,4], and
 * self-destructs (no score) at `$04CC >= 6`.
 */
function bossRankAndFire(state, rom, x) {
  const rank = state.zp17;                       // $BA18 / $BA34 / $BA6E LDY $17
  // $BA0A LDA $0360 (player X) / CMP $036C,X / BCC $BA18 -- boss creeps right if player past it
  if (state.obj.x[0] >= bossGet(state, 0x036C + x)) {
    bossSet(state, 0x036C + x, u8(bossGet(state, 0x036C + x) + 2));   // $BA12/$BA15 INC twice
  }
  bossRankMove(state, rom, x, rank);             // loc_BA18
  bodySync(state, x);                            // $BA6B JSR $B9B7
  // $BA6E LDY $17 / LDA $042C,X / CMP $B90A,Y / BCS $BAA0
  if (bossGet(state, 0x042C + x) >= rom.read(0xB90A + rank)) {
    bossFire(state, rom, x);                      // loc_BAA0 -- the fire cycle
    return;
  }
  // $BA78 INC $042C,X / INC $04AC,X / BNE $BA9F
  bossSet(state, 0x042C + x, u8(bossGet(state, 0x042C + x) + 1));
  bossSet(state, 0x04AC + x, u8(bossGet(state, 0x04AC + x) + 1));
  if (bossGet(state, 0x04AC + x) === 0) {        // $BA7E BNE $BA9F ($04AC wrapped)
    bossSet(state, 0x04CC + x, u8(bossGet(state, 0x04CC + x) + 1));   // $BA80 INC volley
    const volley = bossGet(state, 0x04CC + x);   // $BA83 LDY $04CC,X
    if (volley >= 1) bossSet(state, 0x048C + x, 0x01);   // $BA86 CPY #1/BCS -> VULNERABLE
    if (volley >= 5) bossSet(state, 0x048C + x, 0x00);   // $BA8F CPY #5/BCS -> INVULNERABLE
    if (volley >= 6) {                            // $BA98 CPY #6/BCS -> timeout death
      bossTimeoutDeath(state, rom, x);            // $BA9C JMP $B983
      return;
    }
  }
  // $BA9F RTS
}

/**
 * `loc_BA18`-`$BA68` -- rank-indexed VERTICAL movement. The boss paces up/down
 * to track the player; `$B8F8`/`$B901` form a 16-bit step (`SBC` for one
 * direction, `ADC` for the other), result clamped to [$18, $A8]. The direction
 * flag `$03EC,X` is recalculated only on a fire-ready frame (charge >=
 * threshold); between fires the last direction persists.
 *
 * THE CARRY IS LOAD-BEARING and LDA does not touch it, so it is tracked
 * explicitly. Two paths into the fractional SBC/ADC: if the direction was just
 * recalculated this frame the carry is the player-comparison result; if the
 * charge was under threshold (branched at $BA20 with carry clear) the carry
 * into the subtract is CLEAR, subtracting one extra sub-pixel.
 */
function bossRankMove(state, rom, x, rank) {
  const thr = rom.read(0xB90A + rank);           // $BA1D CMP $B90A,Y
  const charge = bossGet(state, 0x042C + x);
  let carry = charge >= thr;                     // $BA1D CMP -> C set iff charge >= thr
  if (carry) {                                   // $BA20 BCC $BA34 (not taken)
    let dir = 0;                                 // $BA22 LDY #$00
    const headY = bossGet(state, 0x032C + x);
    // $BA27 SEC / $BA28 SBC #$10 -- SEC clears the borrow, so A = headY - $10
    const a = u8(headY - 0x10);
    carry = a >= state.obj.y[0];                 // $BA2A CMP $0320 -- C set iff a >= playerY
    if (!carry) dir = 1;                         // $BA2D BCS $BA30 / $BA2F INY
    bossSet(state, 0x03EC + x, dir);             // $BA30 TYA / $BA31 STA $03EC,X
  }
  const dir = bossGet(state, 0x03EC + x);        // $BA36 LDA $03EC,X (C unchanged)
  const lo = rom.read(0xB8F8 + rank);            // $B8F8[$17]
  const hi = rom.read(0xB901 + rank);            // $B901[$17]
  const yf = bossGet(state, 0x034C + x);
  const yi = bossGet(state, 0x032C + x);
  let newY;
  if (dir === 0) {                               // $BA39 BNE $BA4D -- the SBC path
    const r = yf - lo - (carry ? 0 : 1);         // $BA3E SBC $B8F8,Y (borrow = !carry)
    bossSet(state, 0x034C + x, r);               // $BA41 STA $034C,X
    newY = u8(yi - hi - (r >= 0 ? 0 : 1));       // $BA47 SBC $B901,Y (C out = r>=0)
  } else {
    const r = yf + lo + (carry ? 1 : 0);         // $BA50 ADC $B8F8,Y
    bossSet(state, 0x034C + x, r);               // $BA53 STA $034C,X
    newY = u8(yi + hi + (r > 0xFF ? 1 : 0));     // $BA59 ADC $B901,Y
  }
  if (newY < 0x18) newY = 0x18;                  // $BA5C CMP #$18 / $BA60 LDA #$18
  if (newY >= 0xA8) newY = 0xA8;                 // $BA62 CMP #$A8 / $BA66 LDA #$A8
  bossSet(state, 0x032C + x, newY);              // $BA68 STA $032C,X
}

/**
 * `sub_B9B7` + `sub_B9F2` -- THE BODY-SYNC. Positions the two inert body slots
 * (8 and 7) relative to the head every frame and re-asserts their type $99.
 * Entered two ways (fall-through from the intro, JSR from $BA6B); the internal
 * `JSR $B9F2` + `DEX` + fall-through runs `sub_B9F2` twice (X=9 then X=8) from
 * one written-once routine -- the slot-N-1 trick that creates both bodies.
 *
 * `sub_B9F2` is split out because it writes a different mix of conventions per
 * execution: `$018C,X` (the +$0C enemy-relative) clears the CURRENT slot's
 * attrMask (head on the first pass, body 8 on the second), while `$030B,X` /
 * `$010B,X` / `$048B,X` / `$04EB,X` (the +$0B trick) set the PREVIOUS slot's
 * type/status/etc (body 8 then body 7).
 */
function bodySync(state, x) {
  const headX = bossGet(state, 0x036C + x);      // head X
  const headY = bossGet(state, 0x032C + x);      // head Y
  const vuln = bossGet(state, 0x048C + x);       // $B9CA LDY $048C,X
  // sub_B9B7 (X=9):
  bossSet(state, 0x045F + x, 0x02);              // $B9BB s0460[8] = 2
  bossSet(state, 0x045E + x, 0x00);              // $B9C0 s0460[7] = 0
  bossSet(state, 0x012B + x, 0x85);              // $B9C5 anim[20] (body 8) = $85
  // $B9C8 LDA #$03 (the prg.asm listing mis-printed this as #$32; the raw PRG
  // byte at $B9C9 is $03, confirmed against the cartridge's attrMask[19]=3).
  bossSet(state, 0x018A + x, vuln === 0 ? 0x03 : 0x00);  // $B9D1 attrMask[19] (body 7)
  bossSet(state, 0x012A + x, 0x32);              // $B9D6 anim[19] (body 7) = $32
  bossSet(state, 0x036B + x, headX);             // $B9DC x[20] (body 8) = headX
  bossSet(state, 0x036A + x, headX);             // $B9DF x[19] (body 7) = headX
  bossSet(state, 0x032A + x, headY);             // $B9E5 y[19] (body 7) = headY
  bossSet(state, 0x032B + x, u8(headY - 0x14));  // $B9EB y[20] (body 8) = headY-$14 (SEC/SBC)
  // $B9EE JSR $B9F2 (X=9), $B9F1 DEX, fall into $B9F2 (X=8):
  bodySyncSlot(state, x);                        // X = 9
  bodySyncSlot(state, x - 1);                    // X = 8
}
/** One pass of `sub_B9F2`. X is the enemy index (9 or 8). */
function bodySyncSlot(state, x) {
  bossSet(state, 0x018C + x, 0x00);              // $B9F4 attrMask[X+12] = 0 (head, then body8)
  bossSet(state, 0x048B + x, 0x00);              // $B9F7 s0480[X+11] = 0
  bossSet(state, 0x04EB + x, 0x00);              // $B9FA s04E0[X+11] = 0
  bossSet(state, 0x030B + x, 0x99);              // $B9FF type[X+11] = $99
  bossSet(state, 0x010B + x, 0x80);              // $BA04 status[X+11] = $80
}

/**
 * `loc_BAA0`-`$BAF6` -- the fire cycle. Resets the charge and re-positions the
 * 4 armament bullets at slots 25..22 (X = $A9 = 3..0), each offset from the
 * head by tables `$BAF7` (X-off) / `$BAFB` (Y-off), with rank-indexed velocity
 * bytes `$BAFF`/`$BB07`. These slots are a separate projectile pool from the
 * enemy slots; the boss owns them while alive.
 */
function bossFire(state, rom, x) {
  bossSet(state, 0x042C + x, 0x00);              // $BAA0 charge = 0
  const rank = state.zp17;                       // $BAE4 LDY $17
  const headX = bossGet(state, 0x036C + x);      // head X (Y=$A8 in ROM)
  const headY = bossGet(state, 0x032C + x);      // head Y
  for (let a9 = 3; a9 >= 0; a9--) {              // $BAA5 STA $A9=#3 / $BAF2 DEC / BPL
    // $BAAD STA $0476,X -- also zeroes $99/$9A (score scratch, not modelled/watched)
    bossSet(state, 0x0476 + a9, 0x00);           // s0460[22+a9] = 0
    bossSet(state, 0x0376 + a9, u8(headX + rom.read(0xBAF7 + a9)));   // $BAB6-$BABD bullet X
    bossSet(state, 0x0336 + a9, u8(headY + rom.read(0xBAFB + a9)));   // $BAC0-$BAC7 bullet Y
    bossSet(state, 0x0176 + a9, 0x02);           // $BACC animFrame[22+a9] = 2
    bossSet(state, 0x0316 + a9, 0x00);           // $BAD1 type[22+a9] = 0
    bossSet(state, 0x0116 + a9, 0x00);           // $BAD4 status[22+a9] = 0
    bossSet(state, 0x0136 + a9, 0x41);           // $BAD9 anim[22+a9] = $41
    bossSet(state, 0x03F6 + a9, 0x00);           // $BADE yvelf[22+a9] = 0
    bossSet(state, 0x03C6 + a9, 0x00);           // $BAE1 yvel[22+a9] = 0
    bossSet(state, 0x0436 + a9, rom.read(0xBAFF + rank));  // $BAE9 xvel[22+a9] = $BAFF[rank]
    bossSet(state, 0x0456 + a9, rom.read(0xBB07 + rank));  // $BAEF xvelf[22+a9] = $BB07[rank]
  }
  // $BAF6 RTS
}

/**
 * `loc_B962`-`$B9A7` -- the DAMAGE death chain (boss shot to phase 6). On
 * stage 1, if the kill lands in the `$04CC==1` window with charge <$78, the
 * stage-1 warp flag `$39` is set (its effect is W27; its FIRING must not throw)
 * -- and then the full normal death runs regardless. Score, per-player kill
 * tally, explosion->script 4 (metasprite $A2), body clear, and `INC $1B`.
 */
function bossDeath(state, rom, x) {
  // $B962 LDA $19 / CMP #$01 / BNE $B97A -- the stage-1 warp gate
  if (state.zp19 === 1
      && bossGet(state, 0x04CC + x) === 1        // $B96A/$B96D volley == 1
      && bossGet(state, 0x04AC + x) < 0x78) {    // $B971/$B974 charge < $78
    state.zp39 = u8(state.zp39 + 1);             // $B978 INC $39 -- THE WARP FLAG
  }
  // loc_B97A: score + INC $3B + explosion + script override + body clear + INC $1B
  bossDeathTail(state, rom, x, true);
}

/**
 * `$BA9C -> $B983` -- the TIMEOUT death (core not killed by `$04CC == 6`).
 * Jumps straight to the explosion with NO score, NO `INC $3B`, and NO warp-gate
 * evaluation. Everything from `$B983` onward is shared with the damage death.
 */
function bossTimeoutDeath(state, rom, x) {
  bossDeathTail(state, rom, x, false);
}

/**
 * The shared death tail from `loc_B97A`/`$B983`. `scored` selects the
 * `$B97A`-`$B982` preamble (score + INC $3B + the warp gate above); both death
 * triggers land at `$B983` for the explosion conversion.
 */
function bossDeathTail(state, rom, x, scored) {
  if (scored) {
    addScore(state, 0x00, 0x10, 0x00);           // $B97A LDA #$10 / JSR $8455 -- +$001000
    state.cheat[state.zp.player] = u8(state.cheat[state.zp.player] + 1);  // $B97F/$B981 INC $3B,X
  }
  // $B983 LDA #$AC / JSR $CB26: sfx $AC + the explosion conversion sub_CB2B.
  soundRequest(state, 0xAC);                     // $CB28 JSR $EC1E
  explodeInPlace(state, x);                      // sub_CB2B (X=$A8=9 -> slot 21)
  // $B988 LDA #$04 / STA $016C,X -- OVERRIDE explosion script to 4 (-> $A2).
  // explodeInPlace set animFrame=$02 (script 2); the boss uniquely starts at $A2.
  bossSet(state, 0x016C + x, 0x04);
  // $B98D-$B99C body clear: A=0, Y=1; loop X=9,8 writing $030B/$012B/$010B,X.
  for (let xx = x, y = 1; y >= 0; xx--, y--) {   // BPL loops while Y >= 0 (2 iters)
    bossSet(state, 0x030B + xx, 0x00);           // type[xx-1] = 0
    bossSet(state, 0x012B + xx, 0x00);           // anim[xx-1] = 0
    bossSet(state, 0x010B + xx, 0x00);           // status[xx-1] = 0
  }
  // $B99E LDA $0100 / CMP #$02 / BCS $B9A7 -- skip the advance during an ending
  // transition ($0100 is status[0]; >= 2 means a dying/transitioning ship).
  if (state.obj.status[0] < 2) {
    state.substate = u8(state.substate + 1);     // $B9A5 INC $1B -- $85 -> $86
  }
  // $B9A7 RTS
}

// ============================ WAVE 27: THE WARP RAIN ========================
// $B61E (entry 38, type $A6) and its animator $B628. Reached only on the $39
// warp route, where $C686 (above) spawns type-$A6 drops every ~40 frames. The
// drop animates through metasprites $8E..$95 (8 frames, stepping every 6th) and
// drifts left at 2 px/frame until the off-screen box frees it.

/**
 * `$B61E` -- the warp-rain per-frame handler.
 *
 *   B61E  LDY #$00 / JSR $B628        the animator (Y = 0)
 *   B623  LDA #$FE / JMP $B103        X -= 2 ($B164) then the despawn box ($B251)
 *
 * `$B103` is `JSR $B164 / JMP $B251` -- the shared 2-px left drift + off-screen
 * free that a dozen stage-1 handlers already use (addAX + offScreenCheck).
 */
function h_B61E(state, rom, j) {
  sub_B628(state, rom, j, 0);                        // $B620 JSR $B628 (Y = 0)
  addAX(state, j, 0xFE);                             // $B623 LDA #$FE -> $B164
  offScreenCheck(state);                             // $B106 JMP $B251
}

/**
 * `$B628` -- the warp rain's animator (and the table-A/group animator shared
 * with the walkers at $B6E8/$B73E/$B781, all read with their own Y). Y picks a
 * row of three interleaved bytes at `$B650+$B651+$B652`: the timer threshold,
 * the metasprite base, and the frame count.
 *
 *   B628  INC $014C,X / LDA $014C,X / CMP $B650,Y / BCC RTS   throttle
 *   B633  LDA $016C,X / CLC / ADC #$01 / CMP $B652,Y / BCC +2 / LDA #$00  frame++
 *   B640  STA $016C,X / CLC / ADC $B651,Y / STA $012C,X       metasprite = frame + base
 *   B64A  LDA #$00 / STA $014C,X                             reset timer
 *
 * For the rain (Y=0): threshold `$06`, base `$8E`, count `$08` -> 8 frames at
 * metasprites `$8E..$95`, stepping every 6th handler call.
 */
function sub_B628(state, rom, j, y) {
  const o = state.obj; const i = j + ENEMY_BASE;
  o.timer[i] = u8(o.timer[i] + 1);                   // $B628 INC $014C,X
  if (o.timer[i] < rom.read(0xB650 + y)) return;     // $B62E CMP $B650,Y / BCC RTS
  let frame = u8(o.animFrame[i] + 1);                // $B633/$B636/$B637 ADC #$01
  if (frame >= rom.read(0xB652 + y)) frame = 0;      // $B639 CMP $B652,Y / BCS wrap
  o.animFrame[i] = frame;                            // $B640 STA $016C,X
  o.anim[i] = u8(frame + rom.read(0xB651 + y));      // $B643/$B647 ADC $B651,Y / STA $012C,X
  o.timer[i] = 0;                                    // $B64A STA $014C,X
}

// ============== WAVES 32b/32c: THE $0600 ARM POOL ==========================
//
// Stage 5's articulated ARMS. Four groups of $30 bytes at $0600/$0630/$0660/
// $0690 (state.js ARM_POOL / ARM_BASES), six segments each, owned by the enemy
// $CA5E (dispatch entry 20, types $14/$94).
//
// IT IS NOT DESTRUCTIBLE TERRAIN. docs/worklog/gradius/29-plan-whole-game.md
// said so in five places and was wrong in all five; W32's recon accounted for
// every field of all $30 bytes out of the 71 instruction sites that touch
// $0600-$06BF and found no nametable write, no VRAM packet, no terrain-map
// access and no compression. The arm is six (x, y, angle) triples in RAM,
// regenerated every other frame from the owner's position by $CC33/$CC99 and
// drawn purely as sprites by $8C06 (src/oam.js).
//
// The twelve routines and where they live:
//
//   $9663  the $5C census + the HALF-RATE FRAME FORK   src/nmi.js
//   $8BD9/$8C06  the segment sprite pass                src/oam.js
//   $C263  player body vs the segments                  src/collision.js
//   $A4A6  allocate groups + spawn the owner            HERE (sub_A4A6)
//   $C653  the stage-5 late spawner                     HERE (st_C653)
//   $CA5E  the owner enemy                              HERE (h_CA5E)
//   $CB4E  free this owner's groups when it dies        HERE (loc_CB4E)
//   $CB8A/$CB91  the per-frame group driver             HERE (armDriverGated)
//   $CC33/$CC99  the segment kinematics                 HERE (sub_CC33)
//   $CBD1  the arm's tip fires                          HERE (sub_CBD1)   W32c
//   $BEF3/$BF0B  a shot destroys an arm                 src/collision.js  W32c
//
// ALL TWELVE ARE PORTED. W32c closed the last two, and with them the fifth and
// last of W32a's stage-5 walls; the $A2F0 scope guard moved with them.
//
// WHAT THE $0600 BYTES MEAN is in state.js next to ARM_POOL, once, and every
// line below cites the ROM offset rather than a name, because the ROM's own
// operands ($0611,X, $0619,X, $0621,X) are indexed by BASE + SEGMENT and a
// named accessor would hide the +1 that makes $CC99 a chain.

/**
 * `$A4A6` -- allocate up to two arm groups from the nibbles of `$65`, then
 * spawn their OWNER into a free enemy slot. Reached from `$A466` (every stage
 * but 3, i.e. in practice stage 5's four inline-5 wave records) and from
 * `$C676` (the stage-5 late spawner `$C653`).
 *
 *   A4A6  LDX #$09 / LDA $030C,X / BEQ $A4B1 / DEX / BNE $A4A8 / RTS
 *   A4B1  STX $A8 / LDA #$00 / STA $98            $98 = arms allocated
 *   A4B7  LDX #$90 / STX $A9                     the group walk, HIGHEST FIRST
 *   A4BB  LDX $A9 / LDA $0600,X / BNE $A4C4 / BEQ $A500
 *   A4C4  LDA $A9 / SEC / SBC #$30 / STA $A9 / BPL $A4BB
 *   A4CD  LSR $65 x4 / BNE $A4B7                 next nibble, at most twice
 *   A4D7  JSR $A527 ... the owner
 *   A500  LDA $65 / AND #$0F / BEQ $A4CD         nibble 0 = "no arm here"
 *   A506  SEC / SBC #$01 / STA $0601,X           SHAPE = nibble - 1
 *   A50C  LDA $A8 / STA $0600,X                  the group is now OWNED
 *   A511  LDA #$00 / INC $98 / LDY #$05
 *   A517  STA $0610,X / STA $0602,X / STA $0618,X / INX / DEY / BPL $A517
 *   A524  JMP $A4CD
 *
 * THE ALLOCATOR IS THE `DEX / BNE` SHAPE, so slot 0 is never tested -- the same
 * quirk `allocEnemySlot(state, false)` was written and unit-tested for in wave
 * 3, before any caller existed. This is that caller.
 *
 * `$65` IS SHIFTED IN PLACE and is a compared zero-page byte, so the port
 * writes it back on every shift rather than working on a copy. Four `LSR`s and
 * a `BNE` bound the loop at TWO iterations for any byte, which is why one call
 * can never exhaust the pool's four groups.
 *
 * `$A517` CLEARS THE ANGLES AND THE Xs BUT NOT THE Ys. Six iterations write
 * +$10..$15 (angle), +$02..$07 (the parity counter and both timers) and
 * +$18..$1D (X); +$20..$25 (Y) keep whatever the previous tenant left. That is
 * observable on the first frame after a re-allocation and it is the cartridge's,
 * so it is transcribed rather than tidied. ($CC33 rewrites segment 0's Y before
 * anything reads it, but segments 1-5's Ys are chained off it.)
 */
function sub_A4A6(state) {
  const o = state.obj;
  const c = state.coll;
  const sp = state.spawn;
  const j = allocEnemySlot(state, false);      // $A4A6-$A4AE DEX/BNE: NOT slot 0
  if (j < 0) return;                           // $A4B0 RTS -- the spawn is dropped
  sp.zA8 = j;                                  // $A4B1 STX $A8
  let count = 0;                               // $A4B3/$A4B5 STA $98
  for (;;) {
    // $A4B7-$A4CB: the four headers, $90 stepping -$30, first FREE one wins.
    let free = -1;
    for (const base of ARM_BASES) {                // $A4B7-$A4CB
      if (c[ARM_POOL + base] === 0) { free = base; break; }  // $A4BD/$A4C0
    }
    if (free >= 0) {                           // $A4C2 BEQ $A500
      const nib = sp.z65 & 0x0F;               // $A500/$A502 LDA $65 / AND #$0F
      if (nib !== 0) {                         // $A504 BEQ $A4CD -- nibble 0 skips
        c[ARM_POOL + free + 0x01] = u8(nib - 1);   // $A506/$A509 -> $0601,X
        c[ARM_POOL + free + 0x00] = j;             // $A50C/$A50E -> $0600,X
        count = u8(count + 1);                     // $A513 INC $98
        for (let s = 0; s <= 5; s++) {             // $A515 LDY #$05 / $A522 BPL
          c[ARM_POOL + free + 0x10 + s] = 0;       // $A517 STA $0610,X
          c[ARM_POOL + free + 0x02 + s] = 0;       // $A51A STA $0602,X
          c[ARM_POOL + free + 0x18 + s] = 0;       // $A51D STA $0618,X
        }
      }
    }
    sp.z65 = sp.z65 >> 4;                      // $A4CD-$A4D3 LSR $65, four times
    if (sp.z65 === 0) break;                   // $A4D5 BNE $A4B7
  }
  // ---- $A4D7: the OWNER -------------------------------------------------
  clearSlot(state, j);                         // $A4D7 JSR $A527
  const i = j + ENEMY_BASE;
  o.type[i] = sp.z66;                          // $A4DC LDA $66 / STA $030C,X
  o.status[i] = 0x80;                          // $A4E1 LDA #$80 / STA $010C,X
  o.x[i] = 0xF0;                               // $A4E6 LDA #$F0 / STA $036C,X
  o.y[i] = sp.z67;                             // $A4EB LDA $67 / STA $032C,X
  o.anim[i] = 0x89;                            // $A4F0 LDA #$89 / STA $012C,X
  o.animFrame[i] = count;                      // $A4F5 LDA $98 / STA $016C,X
  // $A4FA LDA #$01 / $A4FC STA $0460,X -- X is $A8 = j, so this is $0460 + j,
  // NOT $046C + j. It is the byte $CA87 tests and $CA8C clears (the one-shot
  // DEPLOY flag) and the byte $C079 reads to decide 1 or 2 damage per hit;
  // $046C + j, the accumulated DAMAGE that $CA7E and $CAAC compare, is a
  // different byte and $A527 has just zeroed it.
  o.s0460[j] = 1;                              // $A4FC STA $0460,X
}

/**
 * `$C653` -- stage 5's late-spawner arm, `jt_$C439[4]`. Every `$28` late-spawner
 * calls (and the late spawner itself only runs one frame in four, so every 160
 * frames) it reads one of FOUR rows out of `$C67A` and hands them to `$A4A6`.
 *
 *   C653  INC $68 / LDA $68 / CMP #$28 / BCC $C679 (RTS)
 *   C65B  LDA #$00 / STA $68
 *   C65F  LDA $69 / AND #$06 / TAX
 *   C664  LDA $C67A,X / STA $65        the SHAPE NIBBLES
 *   C669  LDA #$14 / STA $66           type $14 -> dispatch entry 20
 *   C66D  LDA $C67B,X / STA $67        the owner's Y
 *   C672  INX / INX / STX $69
 *   C676  JSR $A4A6
 *
 * `$C67A` is 12 bytes but `AND #$06` makes only the first FOUR rows reachable:
 * `(02,80)` one arm shape 1, `(00,40)` NO ARM AT ALL ($65 = 0 -> $A500's
 * `BEQ $A4CD` -> `LSR` to 0 -> straight to the owner), `(01,80)` one arm shape
 * 0, `(00,C0)` no arm. Rows at +8 and +10 (`12 40`, `28 0A`) are unreachable
 * through the mask -- and `28 0A` is the `$3A` gate `$C684` that the stage-2/3
 * arm `$C686` reads, sitting inside the same run.
 */
function st_C653(state, rom) {
  const sp = state.spawn;
  sp.z68 = u8(sp.z68 + 1);                     // $C653 INC $68
  if (sp.z68 < 0x28) return;                   // $C655-$C659 BCC $C679 (RTS)
  sp.z68 = 0;                                  // $C65B/$C65D
  const x = sp.z69 & 0x06;                     // $C65F/$C661/$C663 TAX
  sp.z65 = rom.read(0xC67A + x);               // $C664/$C667 STA $65
  sp.z66 = 0x14;                               // $C669/$C66B STA $66
  sp.z67 = rom.read(0xC67B + x);               // $C66D/$C670 STA $67
  sp.z69 = u8(x + 2);                          // $C672/$C673 INX INX / $C674 STX $69
  sub_A4A6(state);                             // $C676 JSR $A4A6
}

/**
 * `$CA5E` -- dispatch entry 20, types `$14`/`$94`. THE ARM OWNER: a floating
 * body that drifts left at 0.5 px/frame, bobs toward the player's Y, absorbs
 * shots into a damage counter, DEPLOYS at one rank threshold and DIES at a
 * second, taking its arms with it.
 *
 *   CA5E  LDY $17 / LDA $CA49,Y -> $98      damage to DEPLOY, by rank
 *   CA65  LDA $CA50,Y -> $99                damage to DIE, by rank
 *   CA6A  LDA #$94 / LDX $A8 / STA $030C,X  force INITIALISED every frame
 *   CA71  INC $042C,X / LDA $042C,X / LDY #$81 / AND #$08 / BEQ +1 / INY
 *   CA7E  LDA $046C,X / CMP $98 / BCC $CAA3            not deployed yet
 *   CA85  LDA #$00 / CMP $0460,X / BEQ $CAA1           already nudged
 *   CA8C  STA $0460,X / $036C,X += 8 / $032C,X += 8    the ONE-SHOT nudge
 *   CAA1  INY / INY                                    metasprites $83/$84
 *   CAA3  TYA / STA $012C,X / LDA #$01 / STA $048C,X   ARMOURED: absorbs shots
 *   CAAC  LDA $046C,X / CMP $99 / BCS $CB1B            DEAD
 *   CAB3  LDA $016C,X / BNE $CAC1                      arms still alive?
 *   CAB8  JSR $AEE1 / LDA $012C,X / BNE $CAC1 / RTS    none: drift, maybe freed
 *   CAC1  LDA $04AC,X / BNE $CADC
 *   CAC6  LDA $02 / AND #$3F / STA $04AC,X             a NEW bob timer
 *   CACD  LDY #$00 / LDA $032C,X / CMP $0320 / BCS +1 / INY / STA $04CC,X
 *   CADC  DEC $04AC,X / LDY $17 / LDA $04CC,X / BNE $CB00
 *   CAE6  $034C,X -= $CA57,Y  /  $032C,X -= carry, CLAMPED at $20   (up)
 *   CB00  $034C,X += $CA57,Y  /  $032C,X += carry, CLAMPED at $A8   (down)
 *   CB17  JSR $AEE1 / RTS
 *
 * THE TWO SBC/ADC AT `$CAE9` AND `$CB03` HAVE NO `SEC`/`CLC` IN FRONT OF THEM.
 * The carry they consume is whatever the last carry-setting instruction left,
 * and there are exactly two ways in:
 *
 *   - the timer was still running ($04AC != 0): the last carry writer is
 *     `$CAAF CMP $99` and the `BCS` was NOT taken, so C = 0 -- the subtract
 *     borrows one extra 1/256 px and the add adds none;
 *   - the timer had expired and $CACD-$CAD9 ran: the last carry writer is
 *     `$CAD2 CMP $0320`, so C = 1 exactly when the owner is at or below the
 *     player -- which is also the case that picks the UP branch, so the
 *     one-frame-in-$40 subtract is one unit SMALLER than every other frame's.
 *
 * That asymmetry is 1/256 px on one frame in up to 64 and it is transcribed
 * because it is real, not because it is visible. `docs/knowledge/02`: a missing
 * SEC is not a typo in someone else's code.
 *
 * `$042C,X` is the xvel array -- the ROM reuses it as this handler's own
 * animation counter, exactly as `$AEB2` reuses it as the explosion cursor.
 *
 * READING PAST THE APPARENT END: `$CB1A RTS` ends the live path and `$CB1B` is
 * reached only by `$CAB1 BCS`, so it is a branch target and not a fall-through.
 * `$CB23 JMP $CB4E` means `$CB4E` gets `$CB1B`'s caller's return, and `$CB26`
 * (`LDX $A8`) FALLS THROUGH into `$CB28` (`JSR $EC1E`) which FALLS THROUGH into
 * `$CB2B` -- two fall-throughs in six bytes, both already documented at
 * explodeInPlace() above.
 */
function h_CA5E(state, rom, j) {
  const o = state.obj;
  const i = j + ENEMY_BASE;
  const rank = state.zp17;                     // $CA5E LDY $17
  const toDeploy = rom.read(0xCA49 + rank);    // $CA60 LDA $CA49,Y -> $98
  const toDie = rom.read(0xCA50 + rank);       // $CA65 LDA $CA50,Y -> $99
  o.type[i] = 0x94;                            // $CA6A/$CA6E STA $030C,X
  o.xvel[i] = u8(o.xvel[i] + 1);               // $CA71 INC $042C,X
  let ms = 0x81;                               // $CA77 LDY #$81
  if ((o.xvel[i] & 0x08) !== 0) ms += 1;       // $CA74/$CA79/$CA7B/$CA7D INY
  if (o.s0460[i] >= toDeploy) {                // $CA7E/$CA81 CMP $98 / BCC $CAA3
    if (o.s0460[j] !== 0) {                    // $CA85/$CA87 CMP $0460,X / BEQ $CAA1
      o.s0460[j] = 0;                          // $CA8C STA $0460,X
      o.x[i] = u8(o.x[i] + 8);                 // $CA8F-$CA95 ADC #$08
      o.y[i] = u8(o.y[i] + 8);                 // $CA98-$CA9E ADC #$08
    }
    ms += 2;                                   // $CAA1/$CAA2 INY / INY
  }
  o.anim[i] = ms;                              // $CAA3/$CAA4 TYA / STA $012C,X
  o.s0480[i] = 1;                              // $CAA7/$CAA9 STA $048C,X -- ARMOURED
  if (o.s0460[i] >= toDie) return loc_CB1B(state, j);   // $CAAF/$CAB1 BCS $CB1B
  // ---- alive ------------------------------------------------------------
  // The carry that $CAE9/$CB03 will consume. Getting here means $CAB1's BCS was
  // NOT taken, i.e. C = 0; only $CAD2 below can change it.
  let carry = 0;
  if (o.animFrame[i] === 0) {                  // $CAB3 LDA $016C,X / BNE $CAC1
    h_AEE1(state);                             // $CAB8 JSR $AEE1 (may FREE the slot)
    if (o.anim[i] === 0) return;               // $CABB/$CABE BNE $CAC1 / $CAC0 RTS
  }
  if (o.s04A0[i] === 0) {                      // $CAC1 LDA $04AC,X / BNE $CADC
    o.s04A0[i] = state.frame & 0x3F;           // $CAC6-$CACA LDA $02 / AND #$3F
    const atOrBelow = o.y[i] >= o.y[0];        // $CACF/$CAD2 CMP $0320 / BCS $CAD8
    carry = atOrBelow ? 1 : 0;                 // the carry $CAE9/$CB03 inherits
    o.s04C0[i] = atOrBelow ? 0 : 1;            // $CACD LDY #$00 / $CAD7 INY / $CAD9
  }
  o.s04A0[i] = u8(o.s04A0[i] - 1);             // $CADC DEC $04AC,X
  const step = rom.read(0xCA57 + rank);        // $CADF LDY $17 / $CAE9 / $CB03
  if (o.s04C0[i] === 0) {                      // $CAE1 LDA $04CC,X / BNE $CB00
    const f = o.yf[i] - step - (1 - carry);    // $CAE6/$CAE9 SBC $CA57,Y
    o.yf[i] = u8(f);                           // $CAEC STA $034C,X
    let hi = u8(o.y[i] - (f < 0 ? 1 : 0));     // $CAEF/$CAF2 SBC #$00
    if (hi < 0x20) hi = 0x20;                  // $CAF4/$CAF6 BCS $CAFA / $CAF8
    o.y[i] = hi;                               // $CAFA STA $032C,X
  } else {
    const f = o.yf[i] + step + carry;          // $CB00/$CB03 ADC $CA57,Y
    o.yf[i] = u8(f);                           // $CB06 STA $034C,X
    let hi = u8(o.y[i] + (f > 0xFF ? 1 : 0));  // $CB09/$CB0C ADC #$00
    if (hi >= 0xA8) hi = 0xA8;                 // $CB0E/$CB10 BCC $CB14 / $CB12
    o.y[i] = hi;                               // $CB14 STA $032C,X
  }
  h_AEE1(state);                               // $CB17 JSR $AEE1 / $CB1A RTS
}

/**
 * `$CB1B` -- the owner's death. Score `$844B` (+$0500), sfx `$0A`, turn the slot
 * into an explosion, then free every group this owner held.
 */
function loc_CB1B(state, j) {
  addScore(state, 0x00, 0x05, 0x00);           // $CB1B JSR $844B -> $9A = 5
  soundRequest(state, 0x0A);                   // $CB1E/$CB20 JSR $CB26 -> $CB28 -> $EC1E
  explodeInPlace(state, j);                    // $CB26 LDX $A8, falls into $CB2B
  loc_CB4E(state, j);                          // $CB23 JMP $CB4E
}

/**
 * `$CB4E` -- free every group owned by slot `$A8`, and turn a free enemy slot
 * into an explosion at each freed arm's SEGMENT 2.
 *
 *   CB4E  LDX #$90 / STX $A9
 *   CB52  LDX $A9 / LDY $0600,X / BEQ $CB80 / CPY $A8 / BNE $CB80
 *   CB5D  LDA #$00 / STA $0600,X
 *   CB62  LDX #$07 / LDA $030C,X / BNE $CB7D / JSR $CB2B     slots 7..0, DEX/BPL
 *   CB6C  LDY $A9 / LDA $061A,Y / STA $036C,X                segment 2's X
 *   CB74  LDA $0622,Y / STA $032C,X                          segment 2's Y
 *   CB7D  DEX / BPL $CB64
 *   CB80  LDA $A9 / SEC / SBC #$30 / STA $A9 / BPL $CB52
 *
 * SEGMENT 2 IS THE ONE THE EXPLOSION SITS ON, and it is the same segment
 * `$BF31 CMP #$02` makes the only vulnerable one -- the ROM's constant in two
 * places, not a choice. The slot scan is `LDX #$07`, so it stops at enemy slot
 * 7 and never uses 8 or 9; and it IS the `DEX / BPL` shape, so slot 0 is
 * eligible here even though `$A4A6`'s allocator refuses it.
 */
function loc_CB4E(state, owner) {
  const c = state.coll;
  const o = state.obj;
  for (const base of ARM_BASES) {              // $CB4E/$CB80-$CB87
    if (c[ARM_POOL + base] === 0) continue;    // $CB54/$CB57 LDY $0600,X / BEQ $CB80
    if (c[ARM_POOL + base] !== owner) continue;  // $CB59/$CB5B CPY $A8 / BNE $CB80
    c[ARM_POOL + base] = 0;                    // $CB5D/$CB5F STA $0600,X
    for (let x = 7; x >= 0; x--) {             // $CB62 LDX #$07 / $CB7D DEX / BPL
      if (o.type[x + ENEMY_BASE] !== 0) continue;   // $CB64/$CB67 BNE $CB7D
      explodeInPlace(state, x);                // $CB69 JSR $CB2B
      o.x[x + ENEMY_BASE] = c[ARM_POOL + base + 0x1A];   // $CB6E/$CB71 $061A,Y
      o.y[x + ENEMY_BASE] = c[ARM_POOL + base + 0x22];   // $CB74/$CB77 $0622,Y
      break;                                   // $CB7A JMP $CB80
    }
  }
}

/**
 * `$9663`'s census -- how many of the four groups are LIVE. Walks LOW to HIGH,
 * unlike every other walk over this pool, and that is the listing's order:
 * `$0600`, `$0630`, `$0660`, `$0690`, each `LDA / BEQ +1 / INX`.
 *
 * The result is `$5C`, and `$5C >= 2` is what forks the frame (src/nmi.js).
 */
export function armCensus(state) {
  const c = state.coll;
  let x = 0;                                   // $9669 LDX #$00
  if (c[ARM_POOL + 0x00] !== 0) x += 1;        // $966B/$966E/$9670
  if (c[ARM_POOL + 0x30] !== 0) x += 1;        // $9671/$9674/$9676
  if (c[ARM_POOL + 0x60] !== 0) x += 1;        // $9677/$967A/$967C
  if (c[ARM_POOL + 0x90] !== 0) x += 1;        // $967D/$9680/$9682
  return x;                                    // $9683 STX $5C
}

/**
 * `$CB8A` -- the driver's OWN half-rate gate, and it is the third `$5C >= 2`
 * test in the frame. `$C772` (the `$19 == 4` gate at `$9A76`) jumps here, so on
 * a two-arm frame the `$9A76` call does NOTHING and the arms are driven from
 * `$9691` instead -- inside the fork, at 30 Hz. With 0 or 1 arms alive there is
 * no fork and `$9A76` is the only driver call.
 *
 *   CB8A  LDA $5C / CMP #$02 / BCC $CB91 / RTS
 */
export function armDriverGated(state, rom) {
  if (state.zp5C >= 2) return;                 // $CB8A-$CB90 BCC $CB91 / RTS
  armDriver(state, rom);
}

/**
 * `$CB91` -- one pass over the four groups: kinematics, then the fire timer.
 *
 *   CB91  LDA #$00 / STA $AE          AT MOST ONE ARM FIRES PER PASS
 *   CB95  LDX #$90 / STX $A8
 *   CB99  LDX $A8 / LDY $0600,X / BEQ $CBC0
 *   CBA0  JSR $CC33 / LDX $A8         X reloaded -- $CC33 clobbers it
 *   CBA5  INC $0604,X / LDA $0604,X / LDY $17 / CMP $CBCA,Y / BCC $CBC0
 *   CBB2  LDA $AE / BNE $CBC0 / INC $AE
 *   CBB8  LDA #$00 / STA $0604,X / JSR $CBD1
 *   CBC0  LDA $A8 / SEC / SBC #$30 / STA $A8 / BPL $CB99
 *
 * `$AE` IS THE ONE-SHOT. The port keeps it in `state.spawn.zAE` rather than in
 * a local because it is the same zero-page byte `$ADAF` clears at the top of
 * every `$ADAB`, and state.js used to say of it "NO READER FOUND" -- that note
 * is wrong and is corrected in this commit. `$CBB2 LDA $AE` is its reader.
 *
 * `$CBA5 INC $0604,X` RUNS EVEN WHEN `$CC33` HAS JUST FREED THE GROUP. `$CC19`
 * zeroes `$0600,X` and returns, and nothing re-tests the header, so a group can
 * fire on the same frame it dies. Transcribed, not fixed.
 */
export function armDriver(state, rom) {
  const c = state.coll;
  state.spawn.zAE = 0;                         // $CB91/$CB93 STA $AE
  for (const base of ARM_BASES) {              // $CB95/$CBC0-$CBC7
    // $CB97 STX $A8 / $CBC5 STA $A8. W32b left `$A8` unwritten here because
    // nothing in the walk read it; `$CBD1` reads it TWICE ($CBDC and $CC02),
    // so the byte is now kept for real. The exit value is $D0, not $FF -- the
    // walk steps by $30 and $00 - $30 is what fails $CBC7's BPL.
    state.spawn.zA8 = base;                    // $CB97/$CBC5 STA $A8
    const owner = c[ARM_POOL + base];          // $CB9B LDY $0600,X
    if (owner === 0) continue;                 // $CB9E BEQ $CBC0
    sub_CC33(state, rom, base, owner);         // $CBA0 JSR $CC33
    const t = u8(c[ARM_POOL + base + 0x04] + 1);   // $CBA5 INC $0604,X
    c[ARM_POOL + base + 0x04] = t;
    if (t < rom.read(0xCBCA + state.zp17)) continue;   // $CBAB/$CBAD/$CBB0 BCC $CBC0
    if (state.spawn.zAE !== 0) continue;       // $CBB2/$CBB4 BNE $CBC0
    state.spawn.zAE = u8(state.spawn.zAE + 1); // $CBB6 INC $AE
    c[ARM_POOL + base + 0x04] = 0;             // $CBB8/$CBBA STA $0604,X
    sub_CBD1(state);                           // $CBBD JSR $CBD1 -- W32c
  }
  state.spawn.zA8 = u8(0x00 - 0x30);           // $CBC0-$CBC7 left $A8 = $D0
}

/**
 * `$CBD1`-`$CC18` -- THE ARM'S TIP FIRES. Wave 32c.
 *
 *   CBD1  LDX #$09 / LDA $0136,X / BEQ $CBDC / DEX / BPL $CBD3 / (RTS)
 *   CBDC  LDY $A8 / LDA $061D,Y / CMP #$10 / BCC $CBDB     tip X < $10
 *   CBE5  CMP #$F0 / BCS $CBDB                             tip X >= $F0
 *   CBE9  LDA $0625,Y / CMP #$D0 / BCS $CBDB               tip Y >= $D0
 *   CBF0  STX $A9
 *   CBF2  LDA #$86 / STA $0136,X                           the metasprite
 *   CBF7  LDA #$00 / STA $0316,X / STA $0116,X / STA $0176,X
 *   CC02  LDY $A8 / LDA $061D,Y / SEC / SBC #$08 / STA $0376,X
 *   CC0D  LDA $0625,Y / SEC / SBC #$08 / STA $0336,X
 *   CC16  JMP $BCB1                                        <-- FALL-THROUGH pair
 *
 * **`$CBF9` WRITES A LITERAL 0 INTO `$0316,X` WHERE `$BC83` WRITES `$BC66,Y`.**
 * That is the one structural difference from the ordinary enemy-bullet
 * allocator six routines up, and it is worth being precise about, because the
 * obvious dramatic reading of it is WRONG and this comment carried it for an
 * afternoon: `$BC66` is `00 01`, so kind 0 -- the common case -- is type 0 too.
 * The arm's bullet is therefore *fixed* at kind 0; it is not *uniquely* type 0.
 * (Counted out of prg.bin: exactly six instructions write `$0316` -- `$B8CA`
 * the boss's, value 2; `$BAD1`, 0; `$BC83`, `$BC66,Y` = 0 or 1; `$BFAE`, the
 * free; `$C739`, 1; and this one, 0.)
 *
 * What the byte then decides, from its only two readers:
 *
 *   * `$BF77 LDA $0316,Y / BNE $BF7D` -- the SHOT-vs-bullet sweep treats 0 as
 *     "empty slot" and returns without testing geometry, so **an arm's bullet
 *     cannot be shot down.** A type-1 bullet in the same place IS destroyed
 *     (`$BF9F`), and a type-2 one kills the SHOT instead (`$BF97`). The type is
 *     load-bearing; what it is not is unique.
 *   * `$C22A LDA $0136,Y / BEQ $C259` -- the PLAYER-vs-bullet sweep gates on
 *     `$0136` (the metasprite) instead, so the bullet is fully lethal whatever
 *     its type, with box class `$0176` = 0 -> `$C202[0]` = $10 wide and
 *     `$C206[0]` = $08 tall. `$BC23`'s MOVER gates on `$0136` as well.
 *
 * `$BC6E`'s status ladder (which picks kind 1 for a firing enemy whose status
 * is $80-$8F) has NO counterpart here: the arm always fires kind 0.
 *
 * `$CBF0 STX $A9` IS A DEAD STORE. `$CC16 JMP $BCB1` is `TXA / CLC / ADC #$0A`
 * falling into `$BCB5 STA $A9`, which overwrites it with slot + $0A two
 * instructions later, and nothing between $CBF0 and $CC16 reads `$A9`. It is
 * transcribed anyway (one line, and `$A9` is a real zero-page byte that is
 * observable between the two writes only if something faults in between --
 * nothing does), and named here so the next reader does not re-derive it as
 * meaningful.
 *
 * `$CBDB` IS A FALL-THROUGH TARGET AS WELL AS A BRANCH TARGET: the allocator's
 * `$CBD9 BPL $CBD3` drops into it when X reaches $FF, and $CBE3/$CBE7/$CBEE all
 * branch to it. Four ways to decline to fire, one RTS.
 *
 * THE THREE MUZZLE GATES ARE ON THE TIP, SEGMENT 5 (`+$1D` / `+$25`), not on
 * the owner: an arm whose tip has swept off the left edge, past the right edge
 * or below the play area holds its fire, and `$CBB8` has ALREADY reset the fire
 * timer, so the shot is lost rather than deferred -- the same "allocation
 * failure is gameplay" shape `$BC63` has.
 *
 * `$CC02 LDY $A8` RE-READS BOTH COORDINATES. It is not a cached copy of the
 * bytes the gates tested; nothing writes them in between, so the values are the
 * same, and it is transcribed as a re-read because that is what the ROM does.
 */
function sub_CBD1(state) {
  const o = state.obj;
  const c = state.coll;
  // $CBDC LDY $A8 -- the GROUP BASE, read out of zero page and not handed in.
  // The first draft took it as a parameter and a mutant that stopped the driver
  // writing `$A8` survived, because nothing then depended on the byte. It is
  // read here for the same reason the ROM reads it: `$CBD1` is a subroutine and
  // `$A8` is its only argument.
  const base = state.spawn.zA8;                // $CBDC LDY $A8
  let k = -1;
  for (let x = 9; x >= 0; x--) {               // $CBD1 LDX #$09 / $CBD8 DEX / BPL
    if (o.anim[22 + x] === 0) { k = x; break; }    // $CBD3/$CBD6 BEQ $CBDC
  }
  if (k < 0) {                                 // $CBDB RTS -- every slot busy
    state.work.armBulletAllocFail += 1;        // counted, so the failure is VISIBLE
    return;
  }
  const tipX = c[ARM_POOL + base + 0x1D];      // $CBDE LDA $061D,Y
  if (tipX < 0x10) return;                     // $CBE1/$CBE3 CMP #$10 / BCC $CBDB
  if (tipX >= 0xF0) return;                    // $CBE5/$CBE7 CMP #$F0 / BCS $CBDB
  const tipY = c[ARM_POOL + base + 0x25];      // $CBE9 LDA $0625,Y
  if (tipY >= 0xD0) return;                    // $CBEC/$CBEE CMP #$D0 / BCS $CBDB
  state.spawn.zA9 = k;                         // $CBF0 STX $A9 -- DEAD, see above
  const i = 22 + k;
  o.anim[i] = 0x86;                            // $CBF2/$CBF4 STA $0136,X
  o.type[i] = 0;                               // $CBF9 STA $0316,X -- see above
  o.status[i] = 0;                             // $CBFC STA $0116,X
  o.animFrame[i] = 0;                          // $CBFF STA $0176,X -- box class 0
  o.x[i] = u8(c[ARM_POOL + base + 0x1D] - 8);  // $CC02-$CC0A SEC / SBC #$08
  o.y[i] = u8(c[ARM_POOL + base + 0x25] - 8);  // $CC0D-$CC15 SEC / SBC #$08
  aimBullet(state, u8(k + 0x0A));              // $CC16 JMP $BCB1 -- FALL-THROUGH
}

/**
 * `$CC33` + `$CC99` -- THE SEGMENT KINEMATICS, and the largest single routine
 * in the pool (332 bytes). Regenerates all six segments of ONE group from its
 * owner's position, every OTHER frame.
 *
 *   CC33  LDA $030C,Y / BEQ $CC19          the owner is gone -> free the group
 *   CC38  LDA $0603,X                      DEAD LOAD (overwritten at $CC3E)
 *   CC3B  DEC $0603,X / LDA $0603,X / AND #$01 / BEQ $CC46 / RTS
 *   CC46  $98 := $036C,Y   $99 := $032C,Y             the owner's X and Y
 *   CC50  LDA $0460,Y / ASL / ASL / CLC / ADC $0601,X / STA $9A
 *   CC5B  LDA $0601,X / TAY / AND #$01 / STA $9F      TAY BEFORE the AND
 *   CC63  $9B := $CC1F,Y   $9C := $CC21,Y             the angle floor/ceiling
 *   CC6D  TXA / ASL / ADC $02 / AND #$7F / ADC $0360 / AND #$F0 / STA $9E
 *   CC7A  LDY $9A / $0618,X := $CC23,Y + $98          segment 0's X
 *   CC85  $0620,X := $CC2B,Y + $99                    segment 0's Y
 *   CC8E  STX $A9 / $AA := 4 / $9D := $0320           then fall into $CC99
 *
 * `$CC19` IS ENTERED FROM `$CC36 BEQ`, i.e. it is the FIRST thing this routine
 * can do, and it is the silent free the recon named: an owner that died by any
 * other route (a shot, `$AEF8`'s off-screen box) leaves its groups behind and
 * this is what reaps them.
 *
 * `$9E` IS THE TARGET COLUMN THE ARM REACHES FOR, and its arithmetic carries
 * two carries that a rewrite loses: `ASL A` on base `$90` sets carry, so group
 * 3's `ADC $02` is one higher than groups 0-2's; and `AND #$7F` does not touch
 * the carry, so that same bit rides into `ADC $0360` (the PLAYER's X). Both are
 * transcribed.
 *
 * `$9A` = `4 * $0460[owner] + shape`, so the segment-0 offset row changes the
 * moment the owner DEPLOYS ($CA8C clears $0460). `$9F` = shape AND 1 and picks
 * which way the arm sweeps.
 *
 * `$CC38`'s load IS DEAD -- `$CC3B DEC` and `$CC3E LDA` reload the same byte two
 * instructions later. Written as a comment rather than as code, and named here
 * so the next reader does not "restore" it.
 */
function sub_CC33(state, rom, base, owner) {
  const c = state.coll;
  const o = state.obj;
  const oi = owner + ENEMY_BASE;
  if (o.type[oi] === 0) {                      // $CC33/$CC36 LDA $030C,Y / BEQ $CC19
    c[ARM_POOL + base] = 0;                    // $CC19/$CC1B STA $0600,X
    return;                                    // $CC1E RTS
  }
  // $CC38 LDA $0603,X is DEAD -- see the note above.
  const par = u8(c[ARM_POOL + base + 0x03] - 1);   // $CC3B DEC $0603,X
  c[ARM_POOL + base + 0x03] = par;
  if ((par & 0x01) !== 0) return;              // $CC3E-$CC45 AND #$01 / BEQ / RTS
  const ox = o.x[oi];                          // $CC46/$CC49 -> $98
  const oy = o.y[oi];                          // $CC4B/$CC4E -> $99
  const shape = c[ARM_POOL + base + 0x01];     // $CC5B LDA $0601,X
  const z9A = u8(u8(o.s0460[owner] << 2) + shape);   // $CC50-$CC59 ASL/ASL/ADC
  const z9F = shape & 0x01;                    // $CC5F/$CC61 AND #$01 -> $9F
  let lo = rom.read(0xCC1F + shape);           // $CC63 LDA $CC1F,Y -> $9B
  let hi = rom.read(0xCC21 + shape);           // $CC68 LDA $CC21,Y -> $9C
  // $CC6D-$CC78: the target column, carries included.
  let a = base;                                // $CC6D TXA
  let carry = (a >> 7) & 1;                    // $CC6E ASL A -- carry OUT
  a = u8(a << 1);
  let s = a + state.frame + carry;             // $CC6F ADC $02
  carry = s > 0xFF ? 1 : 0;
  a = u8(s) & 0x7F;                            // $CC71 AND #$7F -- carry untouched
  s = a + o.x[0] + carry;                      // $CC73 ADC $0360 (the PLAYER's X)
  const z9E = u8(s) & 0xF0;                    // $CC76 AND #$F0 -> $9E
  c[ARM_POOL + base + 0x18] = u8(rom.read(0xCC23 + z9A) + ox);   // $CC7C-$CC82
  c[ARM_POOL + base + 0x20] = u8(rom.read(0xCC2B + z9A) + oy);   // $CC85-$CC8B
  const z9D = o.y[0];                          // $CC94/$CC97 LDA $0320 -> $9D
  // ---- $CC99: five iterations, segment k+1 chained off segment k ---------
  // $CC8E STX $A9 / $CC90 LDA #$04 / STA $AA, then $CD5B INC $A9 / DEC $AA /
  // BMI $CD64. $AA = 4,3,2,1,0 -> FIVE passes, k = 0..4, producing segments
  // 1..5. Segment 0 was written above and its ANGLE ($0610) is never written
  // by anything but $A517's clear.
  for (let k = 0; k <= 4; k++) {               // $CD5D DEC $AA / $CD5F BMI $CD64
    const p = ARM_POOL + base + k;             // X = $A9
    const seen = c[p + 0x19] & 0xF0;           // $CC9F/$CCB0 LDA $0619,X / AND #$F0
    // $CC9B LDA $9F / BEQ $CCB0 -- the two sweeps are MIRRORED, not equal:
    // odd shapes DEC on `<=` and INC on `>`; even shapes INC on `<`, DEC on
    // `>` and leave the angle alone on `==`. The `==` case is the difference.
    let ang = c[p + 0x11];
    if (z9F !== 0) {                           // $CC9D BEQ $CCB0
      if (seen <= z9E) ang = u8(ang - 1);      // $CCA6 BEQ / $CCA8 BCC -> $CCBB
      else ang = u8(ang + 1);                  // $CCAA INC $0611,X
    } else if (seen < z9E) {
      ang = u8(ang + 1);                       // $CCB9 BCC $CCAA
    } else if (seen > z9E) {
      ang = u8(ang - 1);                       // fall through to $CCBB
    }                                          // seen == $9E -> $CCB7 BEQ, no change
    if (ang < lo) ang = lo;                    // $CCC1/$CCC3 CMP $9B / BCS / LDA $9B
    if (ang >= hi) ang = hi;                   // $CCC7/$CCC9 CMP $9C / BCC / LDA $9C
    c[p + 0x11] = ang;                         // $CCCD STA $0611,X
    // $CCD0-$CCF4: the SNAP-BACK. Each sweep has one angle band it refuses to
    // hold while the segment is on the wrong side of the player's Y.
    if (z9F !== 0) {                           // $CCD0 LDY $9F / BEQ $CCE7
      if (ang >= 0x84 && c[p + 0x21] >= z9D) { // $CCD4 CMP #$84 / $CCDB CMP $9D
        ang = 0x7C; c[p + 0x11] = ang;         // $CCDF/$CCE1 LDA #$7C
      }
    } else if (ang < 0x3C && c[p + 0x21] < z9D) {   // $CCE7 CMP #$3C / $CCEE CMP $9D
      ang = 0x44; c[p + 0x11] = ang;           // $CCF2/$CCF4 LDA #$44
    }
    // $CCF7-$CD03: the NEXT segment may only bend +/- 6 from this one. ($CD05
    // TYA is dead -- $CD06 reloads immediately.)
    hi = u8(ang + 6);                          // $CCFB/$CCFC CLC / ADC #$06
    lo = u8(hi - 0x0C);                        // $CD00/$CD01 SEC / SBC #$0C
    // $CD06-$CD22: the angle folds to 0-$1F and picks a signed dX. The high
    // half SUBTRACTS with the carry `CPY #$20` left SET; the low half ADDS with
    // it CLEAR. Two branches of one 32-entry table, and the fold is what makes
    // $CD65's 32 bytes cover a 64-value angle.
    let y = ang & 0x3F;                        // $CD06/$CD09 AND #$3F / TAY
    let nx;
    if (y >= 0x20) {                           // $CD0C CPY #$20 / BCC $CD1C
      y = y & 0x1F;                            // $CD10/$CD12 AND #$1F / TAY
      nx = u8(c[p + 0x18] - rom.read(0xCD65 + y));      // $CD13/$CD16 SBC, C = 1
    } else {
      nx = u8(rom.read(0xCD65 + y) + c[p + 0x18]);      // $CD1C/$CD1F ADC, C = 0
    }
    c[p + 0x19] = nx;                          // $CD22 STA $0619,X
    // $CD25-$CD3E: the WRAP KILL. A segment that has run off one edge is
    // parked at X = 0, but only when the OWNER is on the far side -- so a
    // wrap that is really the arm reaching across the screen survives.
    if (nx < 0x10) {                           // $CD25 CMP #$10 / BCS $CD36
      if (ox >= 0xA0) c[p + 0x19] = 0;         // $CD29/$CD2B CMP #$A0 / BCC $CD40
    } else if (nx >= 0xF0) {                   // $CD36 CMP #$F0 / BCC $CD40
      if (ox < 0x30) c[p + 0x19] = 0;          // $CD3A/$CD3C CMP #$30 / BCC $CD2F
    }
    // $CD40-$CD58: bit 5 of the ANGLE (not of the folded index) picks the sign
    // of dY, and $CD85 is read at the SAME folded index.
    if ((ang & 0x20) !== 0) {                  // $CD40/$CD43 AND #$20 / BEQ $CD51
      c[p + 0x21] = u8(c[p + 0x20] - rom.read(0xCD85 + y));   // $CD47-$CD4B SEC/SBC
    } else {
      c[p + 0x21] = u8(c[p + 0x20] + rom.read(0xCD85 + y));   // $CD51-$CD55 CLC/ADC
    }
  }
}
