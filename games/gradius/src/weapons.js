// WEAPONS. ROM: `$A0E9-$A234`, the second half of `sub_9FFC`.
//
// src/player.js is the first half ($A006-$A0DB: speed, X, Y, the ring, the
// tilt). This file is what it FALLS INTO -- `$A0CB BMI $A0E9` is the exit of
// the Option animation loop, so there is no call and no gate between them, and
// the header of src/player.js that said "firing is deliberately not ported"
// is retired in the same commit as this file (rule 6).
//
// ============================ THE THREE LOOPS ================================
//
//   $A0E9-$A16D  FIRING.        X = $45 down to 0, so Option 2 fires FIRST and
//                               the player LAST, all on one frame, each from
//                               its own $0360,X.
//   $A16F-$A1E5  the MISSILES.  $A8 = 8 down to 6 -- object slots 11, 10, 9.
//   $A1E6-$A234  the SHOTS.     X = 0 up to 5     -- object slots  3..8.
//
// All three are fixed-shape and their iteration counts are asserted below, so
// docs/knowledge/06 mechanism (C) -- an object loop that only partly completes
// on a busy frame -- is answered NO for each of them in the wave that
// introduces them. Measured on the cartridge over 700 frames of held A:
// $A10A ran 3 x 700 with $45 = 2, $A175 3 x 700, $A1EA 6 x 700.
//
// THE TWO LOOPS THAT RUN WHILE THE SHIP IS DEAD. `$9FFC LDA $0100 / CMP #$02 /
// BCC $A006 / JMP $A16F` skips speed, movement, the ring, the tilt AND the
// firing block, and lands in the MIDDLE of this file: a shot already in the air
// keeps flying, and its slot keeps being freed at the right edge, for the whole
// 120-frame death. src/player.js's dead gate now returns the entry point rather
// than just `false`.
//
// ============================ WHAT IS NOT HERE ===============================
//
// Named, each as a throw carrying its ROM address:
//
//   $A19E   the missile CRAWL arm. UNEXERCISED: the terrain probe returned 0 on
//           all 916 calls of the weapons recon and 0 on every call of every
//           scenario here, so the crawl -- metasprite $08, `x += 2`, and the
//           $A199 wall-kill above it -- has never run on this machine. Its
//           SHAPE is known and its constants are not; a reading is not a port.
//   $A17C   the `$19 == 4` probe bypass (stage 5). $19 is 0 throughout.

import { u8, u16 } from './state.js';
import { probeCollision } from './terrain.js';
import { soundRequest } from './sound.js';

const hex2 = (v) => `$${v.toString(16).toUpperCase().padStart(2, '0')}`;

/** Object slot bases, spelled once. `$0123,X` is `$0120 + 3 + X`. */
export const SLOT_A = 3;          // $0123,X / $0163,X / $03A3,X, X = 0..$45
export const SLOT_B = 6;          // $0126,X / $0166,X / $03A6,X
export const SLOT_M = 9;          // $0129,X / $0169,X -- no timer at all

/**
 * `$A0E9-$A16D` -- the firing block.
 *
 *   A0E9  A6 44     LDX $44
 *   A0EB  BD E0 A0  LDA $A0E0,X / 85 98 STA $98      slot-A type
 *   A0F0  BD E6 A0  LDA $A0E6,X / 85 99 STA $99      the sfx id
 *   A0F5  BD E3 A0  LDA $A0E3,X / 85 9C STA $9C      slot-B type
 *   A0FA  A6 18     LDX $18
 *   A0FC  B5 05     LDA $05,X / 29 80 AND #$80 / 85 9A   A, EDGE   -> $9A
 *   A102  B5 07     LDA $07,X / 29 80 AND #$80 / 85 9B   A, HELD   -> $9B
 *   A108  A6 45     LDX $45
 *
 * then per object X, from $45 down to 0:
 *
 *   A10A  BD 23 01  LDA $0123,X / D0 25 BNE $A134    slot A OCCUPIED -> slot B
 *   A10F  A5 9A     LDA $9A / D0 09 BNE $A11C        the A EDGE fires regardless
 *   A113  BD A3 03  LDA $03A3,X / D0 19 BNE $A131    timer running -> DEC it
 *   A118  A5 9B     LDA $9B / F0 18 BEQ $A134        A not held -> slot B
 *   A11C  20 35 A2  JSR $A235                        FIRE
 *   A11F  A5 35     LDA $35 / 9D A3 03 STA $03A3,X
 *   A124  A5 44     LDA $44 / C9 02 CMP #$02 / F0 0A BEQ $A134   DOUBLE -> B too
 *   A12A  A5 35     LDA $35 / 9D A6 03 STA $03A6,X   the CROSS-RELOAD
 *   A12F  D0 2B     BNE $A15C                        skip slot B entirely
 *   A131  DE A3 03  DEC $03A3,X                      ...and FALL THROUGH to B
 *
 * THREE THINGS A RE-IMPLEMENTATION GETS WRONG BY DEFAULT:
 *
 *  1. THE TIMER IS FROZEN WHILE THE SLOT IS OCCUPIED. `$A10A BNE $A134` leaves
 *     $03A3,X alone, so the cadence is `shot lifetime + $35`, NOT $35. MEASURED
 *     over 300 frames of held A: spawns at 400, 444, 488, 530, 574, 618, 660
 *     with gaps interleaving 21/23 -- a fixed 21-frame cadence is red at the
 *     first shot that dies early (00-recon-weapons.md 3, and this wave's
 *     `autofire-normal` scenario compares $03A3-$03A8 per frame).
 *  2. `$A131` IS A FALL-THROUGH, not a `continue`. When slot A's timer is
 *     ticking, slot B is still evaluated on the same frame -- which is exactly
 *     how the two slots alternate at $44 != 2.
 *  3. `$A12F BNE $A15C` branches on $35, which is 20 in stage 1 and 4 after the
 *     rapid-fire bonus, so it is ALWAYS taken. It is written as the conditional
 *     the ROM holds because a $35 of 0 would fall into slot B, and $35 is a byte
 *     that MOVES since wave 7: $8958 sets it to 4 on a seventh capsule collected
 *     while ($07E5 & $0F) is 0, and `capsule-die` does exactly that at f635 --
 *     after which this file's cadence is 4 + the shot's lifetime rather than 20 +
 *     it, on every compared frame to the end of that window. Still never 0, so
 *     the branch is still always taken.
 */
export function fireWeapons(state, res) {
  const o = state.obj;
  const w = res.weaponTables;
  const x44 = state.zp.weapon;
  const typeA = w.read(0xA0E0 + x44);             // $A0EB LDA $A0E0,X -> $98
  const sfx = w.read(0xA0E6 + x44);               // $A0F0 LDA $A0E6,X -> $99
  const typeB = w.read(0xA0E3 + x44);             // $A0F5 LDA $A0E3,X -> $9C
  if (state.zp.player !== 0) throw new Error('$A0FA LDX $18: two-player is unmeasured');
  const edge = state.input.pressed & 0x80;        // $A0FC LDA $05,X / AND #$80
  const held = state.input.held & 0x80;           // $A102 LDA $07,X / AND #$80

  let iters = 0;
  for (let x = state.zp.options; x >= 0; x--) {   // $A108 LDX $45 / $A16C DEX / BPL
    iters += 1;
    let doB = true;
    // ---- slot A, $A10A-$A131 ---------------------------------------------
    if (o.anim[SLOT_A + x] === 0) {               // $A10A LDA $0123,X / BNE $A134
      if (edge !== 0                              // $A10F LDA $9A / BNE $A11C
       || (o.carrier[SLOT_A + x] === 0 && held !== 0)) {   // $A113 / $A118
        spawnShotA(state, x, typeA, sfx);         // $A11C JSR $A235
        o.carrier[SLOT_A + x] = state.zp.autofire;// $A11F LDA $35 / STA $03A3,X
        if (x44 !== 2) {                          // $A124 CMP #$02 / BEQ $A134
          o.carrier[SLOT_B + x] = state.zp.autofire;   // $A12A STA $03A6,X
          if (state.zp.autofire !== 0) doB = false;    // $A12F BNE $A15C
          // $35 = 0 would fall into $A131 and DEC the timer it has just loaded
          // to 0, i.e. to $FF, and then evaluate slot B. Unreachable ($35 is
          // $14, or 4 after $8958's rapid-fire bonus) and written out
          // because the ROM's branch is on $35, not on a constant.
          else o.carrier[SLOT_A + x] = u8(o.carrier[SLOT_A + x] - 1);  // $A131
        }
      } else if (o.carrier[SLOT_A + x] !== 0) {   // $A116 BNE $A131
        o.carrier[SLOT_A + x] = u8(o.carrier[SLOT_A + x] - 1);   // $A131 DEC
        // ...and FALLS THROUGH into $A134. doB stays true.
      }
    }
    // ---- slot B, $A134-$A159 ---------------------------------------------
    // The mirror image, with one asymmetry: $A154's cross-reload falls THROUGH
    // into $A159's `DEC $03A6,X`, so on a slot-B spawn frame with $44 != 2 the
    // slot-B timer reads $35 - 1 while slot A's reads $35. MEASURED at f421:
    // tm[3] = $14 and tm[6] = $13 on the same row. Slot A cannot do this --
    // $A12F jumps over its own DEC.
    if (doB) {
      if (o.anim[SLOT_B + x] === 0) {             // $A134 LDA $0126,X / BNE $A15C
        if (edge !== 0                            // $A139 LDA $9A / BNE $A146
         || (o.carrier[SLOT_B + x] === 0 && held !== 0)) {  // $A13D / $A142
          spawnShotB(state, x, typeB, sfx);       // $A146 JSR $A250
          o.carrier[SLOT_B + x] = state.zp.autofire;   // $A149 STA $03A6,X
          if (x44 !== 2) {                        // $A14E CMP #$02 / BEQ $A15C
            o.carrier[SLOT_A + x] = state.zp.autofire; // $A154 STA $03A3,X
            o.carrier[SLOT_B + x] = u8(o.carrier[SLOT_B + x] - 1);  // $A159 DEC
          }
        } else if (o.carrier[SLOT_B + x] !== 0) { // $A140 BNE $A159
          o.carrier[SLOT_B + x] = u8(o.carrier[SLOT_B + x] - 1);    // $A159 DEC
        }
      }
    }
    // ---- the missile, $A15C-$A169 ----------------------------------------
    // NO TIMER AT ALL. The rate limit is the flight time of the one live
    // missile per object, and the gate is A HELD -- not the edge, so a single
    // tap of A fires a shot and no missile.
    if (state.zp.missile !== 0                    // $A15C LDA $41 / BEQ $A16C
     && o.anim[SLOT_M + x] === 0                  // $A160 LDA $0129,X / BNE $A16C
     && held !== 0) {                             // $A165 LDA $9B / BEQ $A16C
      spawnMissile(state, x);                     // $A169 JSR $A26B
    }
  }
  // $45 is capped at 2 by the meter arm ($89D3 CMP #$02 / BCS) and by nothing
  // else; $A108 would happily loop over more slots. The port asserts the range
  // rather than reading past slot 5 / 8 / 11 in silence.
  if (iters !== state.zp.options + 1) {
    throw new Error(`$A108 ran ${iters} objects for $45 = ${state.zp.options}`);
  }
}

/**
 * `$A235` -- spawn slot A. Four stores and a sound request.
 *
 *   A235  BD 60 03  LDA $0360,X / 9D 63 03 STA $0363,X    X from the OWNER
 *   A23B  BD 20 03  LDA $0320,X / 9D 23 03 STA $0323,X    Y from the OWNER
 *   A241  A5 98     LDA $98 / 9D 23 01 STA $0123,X        the type
 *   A246  A5 44     LDA $44 / 29 01 AND #$01 / 9D 63 01 STA $0163,X
 *   A24D  4C 66 A2  JMP $A266   -> LDA $99 / JMP $EC1E    the sfx
 *
 * `$0380+i`, the sub-pixel X, IS NOT INITIALISED by either shot spawn -- and
 * for the SHOT slots that is unfalsifiable, not merely untested: slots 3-8 only
 * ever hold shots, whose X step is a whole number of pixels, so nothing ever
 * writes $0383-$0388 and zeroing it here is a no-op. MEASURED: adding
 * `o.xf[SLOT_A + x] = 0` was GREEN on all seven scenarios of the break subset.
 * Where the missing initialisation IS observable is $A26B, the MISSILE spawn --
 * slots 9-11 are reused by one missile after another and $0389-$038B carries
 * the previous one's fraction into the next. See spawnMissile().
 */
export function spawnShotA(state, x, type, sfx) {
  const o = state.obj;
  o.x[SLOT_A + x] = o.x[x];                       // $A235/$A238
  o.y[SLOT_A + x] = o.y[x];                       // $A23B/$A23E
  o.anim[SLOT_A + x] = type;                      // $A241/$A243
  o.animFrame[SLOT_A + x] = state.zp.weapon & 1;  // $A246 AND #$01
  requestSfx(state, sfx);                         // $A266 LDA $99 / JMP $EC1E
}

/**
 * `$A250` -- spawn slot B. The same, except the subtype is the WHOLE of $44.
 *
 * At $44 = 2 that is 2, which is the arm of the shot loop that flies up and
 * right; at $44 = 0 and 1 it is the same subtype slot A got, because slot B is
 * then just the other half of the alternating pair.
 */
export function spawnShotB(state, x, type, sfx) {
  const o = state.obj;
  o.x[SLOT_B + x] = o.x[x];                       // $A250/$A253
  o.y[SLOT_B + x] = o.y[x];                       // $A256/$A259
  o.anim[SLOT_B + x] = type;                      // $A25C/$A25E
  o.animFrame[SLOT_B + x] = state.zp.weapon;      // $A261/$A263
  requestSfx(state, sfx);                         // $A266
}

/**
 * `$A26B` -- spawn a missile. SIX px BELOW the owner, and SILENT.
 *
 *   A26B  BD 60 03  LDA $0360,X / 9D 69 03 STA $0369,X
 *   A271  BD 20 03  LDA $0320,X / 18 / 69 06 ADC #$06 / 9D 29 03 STA $0329,X
 *   A27A  A9 0A     LDA #$0A / 9D 29 01 STA $0129,X
 *   A27F  A9 03     LDA #$03 / 9D 69 01 STA $0169,X
 *   A284  60        RTS          <- no JMP $EC1E: the missile makes no sound
 *
 * `$0389,X` IS NOT CLEARED HERE and that one IS observable: a missile inherits
 * the previous missile's sub-pixel X, so the frame it starts on decides whether
 * its half-pixel step carries on the first frame or the second. MEASURED: a
 * deliberate `o.xf[SLOT_M + x] = 0` here is RED on `autofire-missile`.
 *
 * BORN DEAD AT THE FLOOR. With the ship clamped at Y = $C0 the missile is born
 * at $C6, the fly step adds 2 the same frame, and `$A1B9 CMP #$C8 / BCS` kills
 * it before it is ever drawn -- so the slot is free again next frame and this
 * runs AGAIN, silently, every frame the ship sits on the floor. A port that
 * models the missile as "one per N frames" diverges there, which is what the
 * `autofire-missile` scenario is for.
 */
export function spawnMissile(state, x) {
  const o = state.obj;
  o.x[SLOT_M + x] = o.x[x];                       // $A26B/$A26E
  o.y[SLOT_M + x] = u8(o.y[x] + 6);               // $A271-$A277
  o.anim[SLOT_M + x] = 0x0A;                      // $A27A/$A27C
  o.animFrame[SLOT_M + x] = 3;                    // $A27F/$A281
}

/**
 * `$EC1E` -- the sound request. PLAYED as of wave 8 (src/sound.js), and still
 * RECORDED in `state.sfx` as a list, which is not redundancy:
 *
 * a DOUBLE volley with two Options calls $EC1E six times in one frame ($A266 is
 * the shared tail of both shot spawns) and the driver's priority rule REJECTS
 * most of them -- 73 of 83 shot requests in the measured window, because the
 * stage-1 BGM's pulse-1 part owns $B2 = $13 for 513 frames from game frame 310.
 * So "the driver did nothing" is the correct outcome of a call that must still
 * have been made, and the list is what holds the call SITE to account
 * independently of what the driver then decides. `state.sfx` is cleared at the
 * top of every frame by src/nmi.js.
 */
export function requestSfx(state, id) {
  soundRequest(state, id);
}

/**
 * `$A16F-$A1E5` -- the missile loop. THREE iterations: $A8 = 8, 7, 6.
 *
 *   A16F  A2 08     LDX #$08 / 86 A8 STX $A8
 *   A173  A0 00     LDY #$00              <- INSIDE the loop: the fly/crawl
 *   A175  A6 A8     LDX $A8                  selector is re-zeroed per missile
 *   A177  BD 63 01  LDA $0163,X / F0 62 BEQ $A1DE     <- the SUBTYPE, not the
 *   A17C  A5 19     LDA $19 / C9 04 / F0 28 BEQ $A1AA     type, is the liveness
 *   A182  20 AF C3  JSR $C3AF                             test
 *   A185  A0 00     LDY #$00 / C9 00 CMP #$00 / F0 1F BEQ $A1AA
 *   A18B  $A5 -= 8, $A4 += 8, JSR $C3D3 / D0 38 BNE $A1D6   <- KILLED by a wall
 *   A19E  A0 01     LDY #$01 / A9 08 LDA #$08 / D0 08 BNE $A1AC   the CRAWL
 *   A1AA  A9 0A     LDA #$0A
 *   A1AC  9D 23 01  STA $0123,X          the metasprite, EVERY frame
 *   A1AF  B9 A4 A1  LDA $A1A4,Y / 18 / 7D 23 03 ADC $0323,X / 9D 23 03 STA
 *   A1B9  C9 C8     CMP #$C8 / B0 19 BCS $A1D6       dead at the floor
 *   A1BD  B9 A8 A1  LDA $A1A8,Y / 18 / 7D 83 03 ADC $0383,X / 9D 83 03 STA
 *   A1C7  BD 63 03  LDA $0363,X / 79 A6 A1 ADC $A1A6,Y / 9D 63 03 STA
 *   A1D0  B0 04     BCS $A1D6 / C9 F8 CMP #$F8 / 90 08 BCC $A1DE
 *   A1D6  A9 00     LDA #$00 / 9D 23 01 STA $0123,X / 9D 63 01 STA $0163,X
 *   A1DE  C6 A8     DEC $A8 / A5 A8 LDA $A8 / C9 06 CMP #$06 / B0 8D BCS $A173
 *
 * The 16-bit X step is `$0383,X += $A1A8[Y]` then `$0363,X += $A1A6[Y] +
 * carry`, i.e. the fly row is +$0080 = half a pixel per frame.
 */
export function missileLoop(state, res) {
  const o = state.obj;
  const w = res.weaponTables;
  let iters = 0;
  for (let x = 8; x >= 6; x--) {                  // $A16F / $A1DE-$A1E4
    state.spawn.zA8 = x;                          // $A171/$A175
    iters += 1;
    const i = SLOT_A + x;                         // $0123,X with X = 8 is $012B
    if (o.animFrame[i] === 0) continue;           // $A177 LDA $0163,X / BEQ
    let y = 0;                                    // $A173/$A185 LDY #$00 -- fly
    if (state.zp19 === 4) {                       // $A17C LDA $19 / CMP #$04
      throw new Error('$A17C: $19 = 4 (stage 5) skips the missile terrain probe '
                    + 'entirely. UNMEASURED -- $19 was 0 on every frame of every '
                    + 'run made here, so the bypass has never been taken.');
    }
    // $A182 JSR $C3AF. $C3B7's `CPX #$06 / BCC / ADC #$03` is entered with the
    // CARRY SET (that is what CPX leaves when X >= 6, which is the only way to
    // reach the ADC), so a MISSILE probes at Y + 4, not Y + 3. Wave 5's comment
    // in src/collision.js said +3; corrected in this commit.
    const py = u8(o.y[i] + 4);                    // $C3B4-$C3BD
    const px = o.x[i];                            // $C3CE (subtype 3, not 1)
    if (probeCollision(state, px, py) !== 0) {    // $A187 CMP #$00 / BEQ $A1AA
      // $A18B: probe again 8 px UP and 8 px RIGHT. Non-zero -> the missile has
      // hit a wall; zero -> it CRAWLS along the floor.
      if (probeCollision(state, u8(px + 8), u8(py - 8)) !== 0) {  // $A199/$A19C
        freeMissile(state, i);                    // $A1D6
        continue;
      }
      // WAVE 12 CORRECTION, and it is the correction this whole follow-up is
      // about. This used to say the crawl arm "has never run", on the strength
      // of 916 probe calls in the weapons recon and every call of every
      // scenario. That was a fact about OUR SAMPLING. MEASURED on the cartridge
      // with an exec hook on $A19E over 27,400 frames of seven scripts
      // (tools/oracle/throwaudit.py): it runs **203 times, first at game frame
      // 3324**, on the run that carries missiles at all ($41 = 1) and survives
      // deep enough to meet real ground. The corpus never reached it because no
      // scenario both owns missiles and flies past scroll $0380.
      throw new Error(`$A19E: missile ${i} would start CRAWLING at (${px}, ${py})`
                    + ' -- metasprite $08, `x += 2`. NOT PORTED, and REACHABLE: '
                    + 'measured 203 executions of $A19E on the cartridge, first '
                    + 'at frame 3324 (tools/oracle/throwaudit.py). Its shape is '
                    + 'known and its constants are not.');
    }
    o.anim[i] = 0x0A;                             // $A1AA/$A1AC -- every frame
    const ny = u8(o.y[i] + w.read(0xA1A4 + y));   // $A1AF-$A1B6
    o.y[i] = ny;
    if (ny >= 0xC8) { freeMissile(state, i); continue; }   // $A1B9 CMP #$C8/BCS
    const f = o.xf[i] + w.read(0xA1A8 + y);       // $A1BD-$A1C4
    o.xf[i] = u8(f);
    const nx = o.x[i] + w.read(0xA1A6 + y) + (f > 0xFF ? 1 : 0);   // $A1C7-$A1CD
    o.x[i] = u8(nx);
    if (nx > 0xFF || u8(nx) >= 0xF8) freeMissile(state, i);  // $A1D0/$A1D2/$A1D4
  }
  state.spawn.zA8 = 5;                            // $A1DE's DEC failed the BCS
  if (iters !== 3) throw new Error(`$A16F ran ${iters} missiles, not 3`);
}

/** `$A1D6` -- free a missile. TYPE and SUBTYPE only; $0103,X is left alone. */
function freeMissile(state, i) {
  state.obj.anim[i] = 0;                          // $A1D8 STA $0123,X
  state.obj.animFrame[i] = 0;                     // $A1DB STA $0163,X
}

/**
 * `$A1E6-$A234` -- the shot loop. SIX iterations, X = 0 UP to 5 (the only
 * ascending object loop in the game).
 *
 *   A1E6  A2 00     LDX #$00 / 86 98 STX $98        ($98 is scratch, unread)
 *   A1EA  BD 23 01  LDA $0123,X / F0 40 BEQ $A22F   empty
 *   A1EF  BD 63 01  LDA $0163,X / D0 17 BNE $A20B   subtype 0 falls through
 *   A1F4  A9 07     LDA #$07
 *   A1F6  18        CLC / 7D 63 03 ADC $0363,X / 9D 63 03 STA $0363,X
 *   A1FD  C9 F8     CMP #$F8 / 90 2E BCC $A22F
 *   A201  A9 00     LDA #$00 / 9D 63 01 STA $0163,X / 9D 23 01 STA $0123,X
 *   A20B  C9 02     CMP #$02 / D0 11 BNE $A220
 *   A20F  BD 23 03  LDA $0323,X / 38 / E9 04 SBC #$04 / 9D 23 03 STA $0323,X
 *   A218  C9 10     CMP #$10 / 90 E5 BCC $A201     off the TOP of the screen
 *   A21C  A9 04     LDA #$04 / D0 D6 BNE $A1F6     <- back INTO the sub-0 arm
 *   A220  BD 63 03  LDA $0363,X / 18 / 69 0C ADC #$0C / 9D 63 03 STA
 *   A229  B0 D6     BCS $A201 / C9 F0 CMP #$F0 / B0 D2 BCS $A201
 *   A22F  E8        INX / E0 06 CPX #$06 / 90 B6 BCC $A1EA
 *
 * TWO DIFFERENT X KILL THRESHOLDS, and they are not a typo: subtypes 0 and 2
 * die at `x >= $F8` and subtype 1 (the LASER) at `x >= $F0`, with an extra
 * carry test in front of it because $0C can carry where 7 and 4 cannot.
 *
 * `$A21C LDA #$04 / BNE $A1F6` is the DOUBLE's diagonal: it re-enters the
 * subtype-0 arm to do the X half, so the up-shot's horizontal step is 4 and its
 * kill threshold is the subtype-0 one.
 */
export function shotLoop(state) {
  const o = state.obj;
  let iters = 0;
  for (let x = 0; x < 6; x++) {                   // $A1E6 / $A22F-$A232
    iters += 1;
    const i = SLOT_A + x;
    if (o.anim[i] === 0) continue;                // $A1EA LDA $0123,X / BEQ
    const sub = o.animFrame[i];                   // $A1EF LDA $0163,X
    let step;                                     // the X step, once
    if (sub === 0) {                              // $A1F2 BNE $A20B
      step = 7;                                   // $A1F4 LDA #$07
    } else if (sub === 2) {                       // $A20B CMP #$02 / BNE $A220
      const ny = u8(o.y[i] - 4);                  // $A20F-$A215 SEC / SBC #$04
      o.y[i] = ny;
      if (ny < 0x10) { freeShot(state, i); continue; }   // $A218 CMP #$10 / BCC
      step = 4;                                   // $A21C LDA #$04 -> $A1F6
    } else {                                      // $A220: the LASER, subtype 1
      const nx = o.x[i] + 0x0C;                   // $A220-$A226 ADC #$0C
      o.x[i] = u8(nx);
      if (nx > 0xFF || u8(nx) >= 0xF0) freeShot(state, i);   // $A229/$A22B/$A22D
      continue;
    }
    const nx = u8(o.x[i] + step);                 // $A1F6-$A1FB
    o.x[i] = nx;
    if (nx >= 0xF8) freeShot(state, i);           // $A1FD CMP #$F8 / BCC $A22F
  }
  if (iters !== 6) throw new Error(`$A1E6 ran ${iters} shots, not 6`);
}

/**
 * `$A201` -- free a shot. SUBTYPE FIRST, then the type; `$0103,X` is NOT
 * cleared here (only `$C0B7`, the sweep's own free, clears all three).
 */
function freeShot(state, i) {
  state.obj.animFrame[i] = 0;                     // $A203 STA $0163,X
  state.obj.anim[i] = 0;                          // $A206 STA $0123,X
}

/**
 * `$A16F` as the ROM's own entry point. src/player.js jumps here when the ship
 * is dying ($9FFC's `JMP $A16F`) and falls into it when it is not.
 */
export function weaponUpdate(state, res, firing) {
  if (firing) fireWeapons(state, res);            // $A0E9-$A16D
  missileLoop(state, res);                        // $A16F-$A1E5
  shotLoop(state);                                // $A1E6-$A234
}

export { hex2 as _hex2 };
