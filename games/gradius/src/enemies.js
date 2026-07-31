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
//                            `total.raw5 = 0` over every run ever made here.
//   $A3B1                    the single-enemy spawn (`cmd < $80`). Stage 1
//                            chunks 0 and 1 are all `cmd >= $80`; the first
//                            `cmd < $80` record is chunk 1's `C0 00`, at scroll
//                            $0380, i.e. past this corpus.
//   34 of the 42 handlers    no run has dispatched them. The eight that ARE
//                            ported (0/31 = RTS, 1, 2, 3, 4, 5, 6, 8) are the
//                            ones stage 1 reaches in the first 1865 frames.
//   $C413                    the stage-advance arm ($3A != 0, $1B = $82).
//   $BBB7's $BBE5 arm        the `$17 >= 3` rank consumer. Unreachable once any
//                            wave has fired, because it is gated on `$5D == 0`.
//   slots 22-31              enemy bullets. $BC19's loop over them is ported
//                            (it is what runs every frame) but a non-empty
//                            bullet slot throws: $BDD5 is not transcribed.

import { u8, u16, ENEMY_BASE, ENEMY_SLOTS } from './state.js';

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
 */
function freeSlot(state, j) {
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
 *   BEA2  20 1E EC  JSR $EC1E                      the death sound. Wave 8.
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
    if (id !== 0) state.sfx.push(id);              // $BEA0 BEQ / $BEA2 JSR $EC1E
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
    throw new Error(`wave cmd ${hex2(cmd)} < $80: the single-enemy spawn at `
                  + '$A3B1 is not ported. Stage 1 chunks 0 and 1 are all '
                  + 'cmd >= $80 up to scroll $0380 (measured allocP_try = 0)');
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
 */
export function enemyBullets(state, res) {
  const o = state.obj;
  if (state.spawn.z5D !== 0) return bulletUpdate(state);   // $BBB7 BNE $BC19
  // $BBBB LDY #$01, and on stage 1 nothing touches Y again before $BBEC.
  // $BBBD LDA $19 / ORA $1A / BEQ $BBEC -- on stage 1 with $1A = 0 the whole
  // $02-parity / $1A / $46 / $17 ladder at $BBC3-$BBEB is jumped over and $98
  // stays 1. The other arms are not ported: they read $46 (the shield, wave 7)
  // and $17 (the power-up rank, wave 7) and no run here has entered them.
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
    return bulletUpdate(state);                    // $BC0F JMP $BC19 -- and note
                                                   // it LEAVES the loop, fired
                                                   // or not: at most one enemy
                                                   // can reach $BC44 per frame
  }
  return bulletUpdate(state);            // the loop falls through into $BC19
}

/**
 * `$BC44` -- decide whether this enemy actually shoots.
 *
 * On stages 0 and 1 with `$1A` clear there is a gate nothing else in the game
 * has: `LDA $0360 / CMP $036C,X / BCC $BC59` -- fire ONLY IF THE PLAYER IS TO
 * THE LEFT of the enemy. An enemy the ship has already flown past does not
 * shoot backwards. That is why `enemy-waves` never populates slots 22-31: the
 * scenario parks the ship at X = 240 and every enemy spawns at $F0 = 240 and
 * marches left, so `playerX >= enemyX` on every single call.
 *
 * The allocation at `$BC59` onward is NOT ported -- it fills slots 22-31, whose
 * mover $BDD5 is untranscribed and which no measured run has ever exercised.
 */
function fireBullet(state, res, j) {
  if (state.zp1A !== 0 || res.stage.stage >= 2) {  // $BC44 / $BC48 CMP #$02
    throw new Error(`$1A = ${hex2(state.zp1A)}, $19 = ${res.stage.stage}: `
                  + '$BC44 skips the player-position gate on stages 2+ and '
                  + 'goes straight to the bullet allocator at $BC59, which is '
                  + 'not ported');
  }
  // $BC4E LDX $A8 / $BC50 LDA $0360 / CMP $036C,X / $BC56 BCC $BC59
  if (state.obj.x[0] >= state.obj.x[j + ENEMY_BASE]) return;   // $BC58 RTS
  throw new Error(`enemy slot ${j + ENEMY_BASE} fired: the player is at X=`
                + `${state.obj.x[0]}, left of the enemy at X=`
                + `${state.obj.x[j + ENEMY_BASE]}, so $BC56 BCC reaches the `
                + 'enemy-bullet allocator at $BC59. Slots 22-31 and their '
                + 'mover $BDD5 are not ported (no measured run has populated '
                + 'them; the plan excludes them pending a recon).');
}

/**
 * `$BC19` -- ten iterations over the enemy-BULLET slots' metasprite bytes
 * (`$0136,X` is `$0120 + 22 + X`). Every one is 0 in this corpus; $BDD5, the
 * bullet mover, is not transcribed.
 */
function bulletUpdate(state) {
  for (let x = 9; x >= 0; x--) {         // $BC1D LDX #$09 / $BC2F BPL $BC21
    if (state.obj.anim[22 + x] !== 0) {  // $BC23 LDA $0136,X / BEQ $BC2B
      throw new Error(`enemy bullet slot ${22 + x} is live: $BC28 JSR $BDD5 is `
                    + 'not ported (no measured run has ever populated slots '
                    + '22-31 -- stage 1\'s opening enemies do not shoot)');
    }
  }
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
    case 0xB0AF: return h_B0AF(state, j);
    case 0xB198: return h_B198(j);
    case 0xB205: return h_B205(state, j);
    case 0xB26C: return h_B26C(state, j);
    default:
      throw new Error(`unimplemented enemy handler ${hex4(target)} for type `
                    + `${hex2(type)} (entry ${a >> 1} of the 42-entry table at `
                    + `$AE1C) in slot ${j + ENEMY_BASE}. No measured run has `
                    + 'ever dispatched it; port it against the cartridge, do '
                    + 'not guess it from the listing.');
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

// `$B184` (X -= xvel, the mirror of $B154) is deliberately ABSENT. Its only
// call sites are $B1E5 and $B1FA, both inside handler 6's run path, and that
// path is a throw below -- handler 4 enters the shared body at $B1DF and $B1F1,
// which never take it. Writing it here would be untested, unreachable code.

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
 * dispatch at game frame 1722 on the 1900-frame RD run. Type 6 has never been
 * dispatched in any run made here -- its ENTRY is a throw, while its BODY is
 * shared with type 4 and therefore is exercised.
 */
function h_B198(j) {
  throw new Error('enemy type 6 ($B198) has never been dispatched by any '
                + 'measured run; its body is shared with type 4 ($B205) and is '
                + `ported, but its entry is not (slot ${j + ENEMY_BASE})`);
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
