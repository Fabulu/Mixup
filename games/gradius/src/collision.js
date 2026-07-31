// COLLISION, DEATH AND THE EXPLOSION. ROM: `$BFE2` -> `$C0C7` -> `$C2A5`.
//
// ============================ WHO CALLS THIS, AND WHEN =======================
//
// `$C0C7` has exactly TWO references in the whole PRG (`dis6502.py xref C0C7`):
//
//     969D  20 C7 C0  JSR $C0C7      the STAGE-5 half-rate arm -- unreachable
//                                    here, src/nmi.js throws at $9663
//     C052  4C C7 C0  JMP $C0C7      the TAIL of $BFE2, the shot sweep
//
// so on stage 1 the entire collision subsystem is the tail of `$9A70 JSR $BFE2`.
// That is docs/knowledge/02 trap 1 in its purest form: the routine the frame
// calls is "shots versus enemies", and what actually kills the player is what it
// falls into. src/nmi.js used to say of $9A70 "the shot-vs-enemy sweep. Not
// ported (wave 6) ... ten iterations of nothing" -- wrong twice: the loop is
// NINE iterations, and what follows it is everything below. Fixed in the same
// commit (rule 6).
//
// MEASURED, "200:,10:S,190:,300:R", 700 frames, exec hooks:
//
//     hook.C0C7 = 363   hook.BFE2 = 363   hook.C052 = 363   (all identical)
//     hook.C101 = 243   the ALIVE sweep            363 - 120 dying frames
//     hook.C2A5 = 362   ONE less than $C0C7 -- $C1D6 ends `JMP $C2C4` and so
//                       skips $C2A5 on the single frame it fires
//     hook.C2B5 = 362   hook.C2BC = 242
//
// 363 = mode-5 frames 310..699 (390) minus the 27-frame respawn intro.
//
// ============================== THE FOUR ROUTES ==============================
//
// `$C1D6` -- the death -- is reached from four places, and WHICH ONE fires was
// measured before a line of this file was written:
//
//     $C1BF  the player-vs-ENEMY sweep, no shield      1 hit, at f493
//     $C24B  the player-vs-enemy-BULLET sweep          0
//     $C290  the stage-5 destructible-block sweep      0
//     $C2C1  TERRAIN                                   0
//
// Terrain kills nobody in this corpus (stage 1 pages 0-3 hold no solid tiles),
// which is why `scenarios.json` carries a POKED terrain-death scenario: it is
// the only way to make $C2C1 fire inside a compared window.
//
// The box, at the one death the corpus contains (`right-wall` f493):
//   $C16E's arghook reports `a=05 x=00 y=09` -- enemy index 9, box class
//   `$0460,Y` = 0, and dy = 5. From the artifact,
//     f492  player (173,96) enemy (161,98)  dx = (173+4)-161 = 16  REJECTED
//     f493  player (174,96) enemy (164,98)  dx = (174+4)-164 = 14  ACCEPTED
//   so the cartridge exercises the width byte AT ITS BOUNDARY, one frame apart.
//
// ============================== WHAT IS NOT HERE =============================
//
// Named rather than silently absent, each as a throw carrying its ROM address:
//
//   $BFE6-$C047  the shot INNER sweep and $C055's kill chain      wave 6
//   $C13D/$C159  the type $27 and $29 contact arms (1UP, $844B)   unmeasured
//   $C18C        the type-1 "destroy everything" arm ($BE93)      wave 6
//   $C1AF        the capsule pickup ($894B)                       wave 7
//   $C1C1        the shield absorbing a hit                       wave 7
//   $C20A body   player versus enemy bullets (slots 22-31)        excluded
//   $C263-$C2A4  the stage-5 destructible-block sweep             stage 5
//   $C2C4 body   shots versus terrain ($C3AF)                     wave 6
//   $C2FF body   enemy bullets versus terrain                     excluded
//   $EC1E        every sound request ($F7 on death)               wave 8

import { u8, ENEMY_BASE, ENEMY_SLOTS } from './state.js';
import { probeCollision } from './terrain.js';

const hex2 = (v) => `$${v.toString(16).toUpperCase().padStart(2, '0')}`;

/**
 * `$BFE2` -- the shot-vs-enemy sweep, called from `$9A70`.
 *
 *   BFE2  A2 08     LDX #$08
 *   BFE4  86 A8     STX $A8
 *   BFE6  A6 A8     LDX $A8
 *   BFE8  BD 23 01  LDA $0123,X      the shot slots: object 3 + X, X = 8..0
 *   BFEB  F0 5A     BEQ $C047        empty -> next
 *   ...   the inner 10-slot sweep and $C055's kill chain -- WAVE 6
 *   C047  C6 A8     DEC $A8
 *   C049  10 9B     BPL $BFE6
 *   C04B  A5 5C     LDA $5C / C9 02 CMP #$02 / 90 01 BCC $C052 / 60 RTS
 *   C052  4C C7 C0  JMP $C0C7
 *
 * `$0123,X` is the `$0120` array at index 3 + X, NOT the `$0100` one: $0120 + 3
 * = $0123. Object slots 3-11 are shot A, shot B and the missiles (state.js
 * SLOTS), and `$C0BD` frees a slot by writing $0123,X / $0163,X / $0103,X --
 * anim, animFrame and status of the same slot.
 *
 * NINE iterations, unconditionally: `LDX #$08 ... DEC $A8 / BPL`. Asserted
 * below. docs/knowledge/06 mechanism (C) -- partial completion of an object
 * loop -- is answered NO for it by the loop's own shape, there is no early exit.
 */
export function shotSweep(state, res) {
  const o = state.obj;
  let iters = 0;
  for (let x = 8; x >= 0; x--) {                  // $BFE2/$BFE6/$C047/$C049
    state.spawn.zA8 = x;                          // $BFE4 STX $A8
    iters += 1;
    if (o.anim[3 + x] !== 0) {                    // $BFE8 LDA $0123,X / BEQ
      throw new Error(`$BFE8: shot slot ${3 + x} holds metasprite `
                    + `${hex2(o.anim[3 + x])}. The inner sweep ($BFED-$C044), `
                    + `$C055's hit resolver and $BE93's kill chain are wave 6; `
                    + `nothing in the port fires, so a live shot here means the `
                    + `seed carried one.`);
    }
  }
  state.spawn.zA8 = 0xFF;                         // $C047's DEC failed the BPL
  if (iters !== 9) throw new Error(`$BFE2 ran ${iters} slots, not 9`);
  // $C04B: LDA $5C / CMP #$02 / BCC $C052 -- the same stage-5 gate $9A5E has.
  // src/nmi.js throws on $5C >= 2 before this is reached; kept because the RTS
  // is a real arm and skipping the whole of $C0C7 is what it does.
  if (state.zp5C >= 2) return;                    // $C051 RTS
  collision(state, res);                          // $C052 JMP $C0C7
}

/**
 * `$C0C7` -- the collision subsystem proper.
 *
 *   C0C7  AD 00 01  LDA $0100 / C9 02 CMP #$02 / 90 33 BCC $C101
 *   ...   the explosion walk
 *   C0F7  4C A5 C2  JMP $C2A5
 *
 * A dying ship (`$0100 >= 2`) does NOT run any of the three object sweeps: it
 * runs the explosion walk and jumps straight to the terrain part.
 */
export function collision(state, res) {
  if (state.obj.status[0] >= 2) {                 // $C0C7/$C0CA/$C0CC
    explosionWalk(state, res);                    // $C0CE-$C0F4
    terrainPart(state, res);                      // $C0F7 JMP $C2A5
    return;
  }
  if (playerVsEnemies(state, res)) {              // $C101 ... $C1D6
    shotsVsTerrain(state, res);                   // $C1FA JMP $C2C4
    return;
  }
  if (playerVsBullets(state, res)) {              // $C20A ... $C24B -> $C1D6
    shotsVsTerrain(state, res);
    return;
  }
  // $C25D: LDA $19 / CMP #$04 / BNE $C2A5 -- the stage-5 arm falls through here.
  if (state.zp19 === 4) {
    throw new Error('$C263: $19 = 4 (stage 5). The destructible-block sweep over '
                  + '$0600/$0618/$0620 ($C263-$C2A4, and $C290\'s route into '
                  + '$C1D6) is not ported -- the port loads one stage\'s assets.');
  }
  terrainPart(state, res);                        // $C2A5
}

/**
 * `$C0CE-$C0F4` -- the death explosion, one metasprite every ten frames.
 *
 *   C0CE  AD 40 01  LDA $0140 / D0 21 BNE $C0F4      timer running -> just DEC
 *   C0D3  AD 20 01  LDA $0120 / F0 1C BEQ $C0F4      already finished -> DEC
 *   C0D8  A9 0A     LDA #$0A / STA $0140
 *   C0DD  AE 60 01  LDX $0160 / EE 60 01 INC $0160   <- the RING CURSOR, reused
 *   C0E3  BD FA C0  LDA $C0FA,X / STA $0120
 *   C0E9  D0 09     BNE $C0F4
 *   C0EB  8D 21 01  STA $0121 / STA $0122 / STA $0140    A == 0
 *   C0F4  CE 40 01  DEC $0140
 *
 * TWO THINGS A RE-IMPLEMENTATION GETS WRONG BY DEFAULT, both measured on
 * `right-wall` (the artifact's own w_0120 / w_0140 / w_0160):
 *
 *   f544  the walk reads the table's $00, writes $0120/$0121/$0122/$0140 = 0
 *         AND THEN FALLS THROUGH INTO $C0F4, so `$0140` reads **255**, not 0,
 *         and counts down from there for the rest of the death (186 at f613).
 *   f534  table entry 4 is $30 AGAIN, so the fourth step draws no new picture.
 *         A five-entry table would finish the walk ten frames early.
 *
 * `$0160` is `ring.cursor` in the port -- the ROM overloads slot 0's animation
 * frame as the explosion cursor. That is safe because the ring only advances
 * inside `$9FFC`, which bails at its own `$0100 >= 2` gate (src/player.js).
 */
export function explosionWalk(state, res) {
  const o = state.obj;
  if (o.timer[0] === 0 && o.anim[0] !== 0) {      // $C0CE/$C0D1 and $C0D3/$C0D6
    o.timer[0] = 0x0A;                            // $C0D8/$C0DA
    const x = state.ring.cursor;                  // $C0DD LDX $0160
    state.ring.cursor = u8(x + 1);                // $C0E0 INC $0160
    const ms = res.collisionTables.read(0xC0FA + x);   // $C0E3 LDA $C0FA,X
    o.anim[0] = ms;                               // $C0E6 STA $0120
    if (ms === 0) {                               // $C0E9 BNE $C0F4
      o.anim[1] = 0;                              // $C0EB STA $0121
      o.anim[2] = 0;                              // $C0EE STA $0122
      o.timer[0] = 0;                             // $C0F1 STA $0140
    }
  }
  o.timer[0] = u8(o.timer[0] - 1);                // $C0F4 DEC $0140
}

/**
 * `$C101-$C1B5` -- the player against the ten enemy slots.
 *
 *   C101  A9 09 / 85 A8            X = $A8 = 9 down to 0
 *   C105  AD 60 03 / 18 / 69 04 / 85 A0     $A0 = playerX + 4
 *   C10D  AD 20 03 / 18 / 69 08 / 85 A1     $A1 = playerY + 8
 *   C115  A4 A8     LDY $A8
 *   C117  B9 0C 03  LDA $030C,Y / F0 1A BEQ $C136     free slot
 *   C11C  BE 60 04  LDX $0460,Y                       the BOX CLASS
 *   C11F  A5 A0 / 38 / F9 6C 03    A = $A0 - $036C,Y
 *   C125  90 0F     BCC $C136                         player is LEFT of it
 *   C127  DD DA BF  CMP $BFDA,X / B0 0A BCS $C136     dx >= width
 *   C12C  A5 A1 / F9 2C 03         A = $A1 - $032C,Y - 1   <- SBC, carry CLEAR
 *   C131  DD DE BF  CMP $BFDE,X / 90 38 BCC $C16E     dy < height -> HIT
 *   C136  C6 A8     DEC $A8 / 10 DB BPL $C115
 *   C13A  4C 0A C2  JMP $C20A
 *
 * THE `- 1` IN dy IS THE CARRY AND IT IS NOT A TYPO. `$C127 CMP` leaves carry
 * CLEAR exactly when it falls through (A < M), and `$C12E SBC` is a
 * subtract-WITH-BORROW. Measured at f493: `$C16E`'s arghook reports A = 5, and
 * (96 + 8) - 98 = 6. There is no `BCC` after this subtract either, so a player
 * ABOVE the enemy wraps to a large number and the CMP rejects it.
 *
 * TEN iterations, unconditionally, unless the sweep DIES -- which is a state
 * transition, not a work budget, and the compared fields $0100/$1B/$4C see it.
 *
 * @returns {boolean} true if the sweep ended at `$C1D6`
 */
export function playerVsEnemies(state, res) {
  const o = state.obj;
  const box = res.collisionTables;
  const a0 = u8(o.x[0] + 4);                      // $C105-$C10B
  const a1 = u8(o.y[0] + 8);                      // $C10D-$C113
  let iters = 0;
  for (let j = 9; j >= 0; j--) {                  // $C101 / $C136 / $C138
    state.spawn.zA8 = j;                          // $A8, read back by $C1C8
    iters += 1;
    const i = j + ENEMY_BASE;
    const type = o.type[i];                       // $C117 LDA $030C,Y
    if (type === 0) continue;                     // $C11A BEQ $C136
    const cls = o.s0460[j];                       // $C11C LDX $0460,Y  (j, not i)
    if (a0 < o.x[i]) continue;                    // $C121 SEC / SBC / $C125 BCC
    const dx = u8(a0 - o.x[i]);
    if (dx >= box.read(0xBFDA + cls)) continue;   // $C127 CMP $BFDA,X / BCS
    const dy = u8(a1 - o.y[i] - 1);               // $C12C LDA $A1 / SBC $032C,Y
    if (dy >= box.read(0xBFDE + cls)) continue;   // $C131 CMP $BFDE,X / BCC
    if (contact(state, res, j, type)) return true;      // $C16E ... $C1D6
  }
  state.spawn.zA8 = 0xFF;                         // $C136's DEC failed the BPL
  if (iters !== ENEMY_SLOTS) {
    throw new Error(`$C101 ran ${iters} slots, not ${ENEMY_SLOTS}`);
  }
  return false;                                   // $C13A JMP $C20A
}

/**
 * `$C16E-$C1B5` -- what the overlap MEANS, dispatched on the enemy's type.
 *
 *   C16E  B9 0C 03  LDA $030C,Y / 29 7F AND #$7F
 *   C173  C9 27 / F0 C6   type $27 -> $C13D
 *   C177  C9 29 / F0 DE   type $29 -> $C159
 *   C17B  C9 03 / B0 39   type >= 3 -> $C1B8   the ordinary enemies
 *   C17F  C9 01 / D0 B3   type != 1 -> $C136   (type 2 = an explosion: harmless)
 *   C183  B9 0C 01  LDA $010C,Y / F0 AE BEQ $C136
 *   C188  C9 06 / F0 23   status 6 -> $C1AF     the CAPSULE
 *   C18C  ...             otherwise: destroy every enemy on screen
 *
 * @returns {boolean} true if this contact ended at `$C1D6`
 */
function contact(state, res, j, type) {
  const o = state.obj;
  const i = j + ENEMY_BASE;
  const t = type & 0x7F;                          // $C171 AND #$7F
  if (t === 0x27) {                               // $C173/$C175
    throw new Error('$C13D: enemy type $27 touched the ship. The arm that reads '
                  + 'a score digit ($07E5,X), turns the object into type 1 '
                  + 'metasprite $A3 and INCs $20,X (an extra life) is not '
                  + 'ported -- no measured run has spawned type $27.');
  }
  if (t === 0x29) {                               // $C177/$C179
    throw new Error('$C159: enemy type $29 touched the ship. The arm that turns '
                  + 'it into type 1 metasprite $A1 and calls $844B is not '
                  + 'ported -- no measured run has spawned type $29.');
  }
  if (t >= 3) return armedEnemy(state, res, j);   // $C17D BCS $C1B8
  if (t !== 1) return false;                      // $C181 BNE $C136 (type 2)
  const status = o.status[i];                     // $C183 LDA $010C,Y
  if (status === 0) return false;                 // $C186 BEQ $C136
  if (status === 6) {                             // $C188/$C18A CMP #$06
    throw new Error('$C1AF: the ship touched a power-up CAPSULE (type 1, status '
                  + '6). $C1FD (free the slot) and $894B (INC $42, the $CE89 '
                  + 'seventh-capsule bonus, +$0050 score) are wave 7.');
  }
  throw new Error(`$C18C: the ship touched a type-1 object with status ${status}. `
                + 'The arm that frees it and then blows up every enemy on screen '
                + '($C194-$C1AC, JSR $BE93) is wave 6.');
}

/**
 * `$C1B8` -- an ordinary enemy (type AND $7F >= 3) is touching the ship.
 *
 *   C1B8  B9 0C 03  LDA $030C,Y / 10 10 BPL $C1CD
 *   C1BD  A5 46     LDA $46 / F0 15 BEQ $C1D6      <- NO SHIELD: DEATH
 *   C1C1  C6 46     DEC $46
 *   C1C3  B9 0C 01  LDA $010C,Y / 10 08 BPL $C1D0
 *   C1C8  A6 A8     LDX $A8 / FE 6C 04 INC $046C,X
 *   C1CD  4C 36 C1  JMP $C136
 *   C1D0  20 93 BE  JSR $BE93 / 4C 36 C1 JMP $C136
 *
 * `$C1B8`'s BPL is the SPAWN-FRAME INVULNERABILITY: bit 7 of `$030C,X` is the
 * "initialised" flag src/enemies.js sets on an enemy's first update, so an enemy
 * that has not moved yet cannot kill you (00-recon-enemies.md, wave 3).
 */
function armedEnemy(state, res, j) {
  const o = state.obj;
  const i = j + ENEMY_BASE;
  if (!(o.type[i] & 0x80)) return false;          // $C1BB BPL $C1CD
  if (state.zp.shield === 0) { die(state); return true; }  // $C1BF BEQ $C1D6
  throw new Error(`$C1C1: the shield absorbed a hit ($46 = ${state.zp.shield}). `
                + 'DEC $46, the armoured branch ($C1C8 INC $046C,X) and $BE93 '
                + '(destroy what you hit) are wave 7 / wave 6 -- nothing in the '
                + 'port can give the ship a shield yet.');
}

/**
 * `$C1D6` -- THE DEATH. Six stores and a sound request.
 *
 *   C1D6  A5 1B / C9 81 / 90 04     $1B < $81 -> skip the next two
 *   C1DC  A9 00 / 85 60             $60 = 0   (only for $1B >= $81)
 *   C1E0  A9 78 / 85 4C             $4C = 120
 *   C1E4  A9 02 / 8D 00 01          $0100 = 2
 *   C1E9  A9 00 / 8D 60 01 / 8D 40 01   $0160 = $0140 = 0
 *   C1F1  A9 A0 / 85 1B             $1B = $A0
 *   C1F5  A9 F7 / 20 1E EC          sfx $F7. Wave 8.
 *   C1FA  4C C4 C2  JMP $C2C4       <- NOT an RTS: the rest of the sweep is
 *                                      abandoned and the frame goes straight to
 *                                      the shot-vs-terrain loop
 *
 * `$60 = 0` IS CONDITIONAL AND THE CORPUS PROVES IT MATTERS. $1B is $80 at every
 * death here, which is BELOW $81, so the spawn engine's state byte is left
 * alone: MEASURED w_0060 = 2 at f492, f493 and every frame of the death, and 0
 * only at f614 when $9B3E's zero-page wipe clears it. A port that cleared it
 * unconditionally would stall the spawn engine for 120 frames.
 */
export function die(state) {
  if (state.substate >= 0x81) state.spawn.z60 = 0;  // $C1D6-$C1DE
  state.zp4C = 0x78;                              // $C1E0/$C1E2
  state.obj.status[0] = 2;                        // $C1E4/$C1E6 STA $0100
  state.ring.cursor = 0;                          // $C1E9/$C1EB STA $0160
  state.obj.timer[0] = 0;                         // $C1EE STA $0140
  state.substate = 0xA0;                          // $C1F1/$C1F3 STA $1B
  // $C1F5 LDA #$F7 / JSR $EC1E -- the death sound. Wave 8.
}

/**
 * `$C20A-$C259` -- the player against the ten ENEMY BULLET slots (22-31).
 *
 *   C20A  A2 09 / 86 A8
 *   C20E  AD 60 03 / 85 A0 / 18 / 69 06 / 85 A1 / 85 A2      three X bases
 *   C21A  AD 20 03 / 85 A4 / 18 / 69 08 / 85 A5 / 69 04 / 85 A6   three Y bases
 *   C228  A4 A8 / B9 36 01 LDA $0136,Y / F0 2A BEQ $C259
 *   C22F  BE 76 01  LDX $0176,Y     picks WHICH of the three bases ($A0,X)
 *   ...   C24B  4C D6 C1  JMP $C1D6
 *
 * NOT PORTED. Slots 22-31 are the enemy-bullet pool, which the wave plan
 * excludes: nothing in any measured run has ever populated one (src/enemies.js
 * $BC59 is a throw for the same reason), so `$0136,Y` is 0 on every frame and
 * this is ten iterations of nothing. The LOOP is here, and an occupied slot is
 * a loud throw rather than a silent skip.
 *
 * @returns {boolean} true if a bullet killed the ship ($C24B)
 */
function playerVsBullets(state, res) {
  const o = state.obj;
  let iters = 0;
  for (let j = 9; j >= 0; j--) {                  // $C20A / $C259 / $C25B
    state.spawn.zA8 = j;                          // $C20C STX $A8
    iters += 1;
    if (o.anim[22 + j] !== 0) {                   // $C22A LDA $0136,Y / BEQ
      throw new Error(`$C22A: enemy-bullet slot ${22 + j} holds metasprite `
                    + `${hex2(o.anim[22 + j])}. The three-box sweep at `
                    + `$C22F-$C256 and its route into $C1D6 ($C24B) are not `
                    + `ported -- the wave plan excludes slots 22-31 until a run `
                    + `exercises them.`);
    }
  }
  state.spawn.zA8 = 0xFF;                         // $C259's DEC failed the BPL
  if (iters !== ENEMY_SLOTS) {
    throw new Error(`$C20A ran ${iters} slots, not ${ENEMY_SLOTS}`);
  }
  return false;
}

/**
 * `$C2A5` -- the TERRAIN half, and the per-stage gates in front of it.
 *
 *   C2A5  A5 19 / C9 02 / F0 05     $19 == 2 -> $C2B0
 *   C2AB  C9 04 / D0 06 / 60        $19 == 4 -> RTS: stage 5 has NO terrain
 *                                   collision at all
 *   C2B0  A5 02 / 4A / 90 4A        stage 3 checks only on ODD $02 frames
 *   C2B5  AD 00 01 / C9 02 / B0 08  already dying -> $C2C4
 *   C2BC  20 A3 C3  JSR $C3A3       playerX/playerY -> the map -> A
 *   C2BF  F0 03     BEQ $C2C4       empty
 *   C2C1  4C D6 C1  JMP $C1D6       <-- DEATH BY TERRAIN
 *
 * `$C3A3` is `LDA $0320 / STA $A5 / LDA $0360 / STA $A4 / BNE $C3D3` -- so it
 * feeds the player's own screen coordinates into `probeCollision()`, which
 * src/terrain.js has had (unit-tested) since before there was any caller. This
 * is the caller.
 *
 * THE `BNE $C3D3` IS A FALL-THROUGH HAZARD IN THE ROM, NOT HERE: if $0360 were
 * 0 the branch would not be taken and execution would run into `$C3AF`, the
 * SHOT probe, with X undefined. The player's X clamp is [16, 240] (src/player.js
 * $A03A), so it cannot happen; asserted below rather than left as a coincidence.
 */
function terrainPart(state, res) {
  if (state.zp19 === 2) {                         // $C2A5/$C2A7/$C2A9
    // $C2B0 LDA $02 / LSR A / BCC $C2FF -- stage 3 only probes on odd frames.
    if ((state.frame & 1) === 0) { bulletsVsTerrain(state, res); return; }
  } else if (state.zp19 === 4) {                  // $C2AB/$C2AD/$C2AF RTS
    return;
  }
  if (state.obj.status[0] < 2) {                  // $C2B5/$C2B8/$C2BA BCS $C2C4
    if (state.obj.x[0] === 0) {                   // $C3AD BNE $C3D3
      throw new Error('$C3AD: $0360 = 0, so `LDA $0360 / BNE $C3D3` falls '
                    + 'through into $C3AF (the SHOT probe) with X whatever the '
                    + 'caller left. The player X clamp is [16, 240] ($A03A), so '
                    + 'this is unreachable on the cartridge too.');
    }
    // $C2BC JSR $C3A3 -> $C3D3, and $C2BF BEQ $C2C4.
    if (probeCollision(state, state.obj.x[0], state.obj.y[0]) !== 0) {
      die(state);                                 // $C2C1 JMP $C1D6
      shotsVsTerrain(state, res);                 // $C1FA JMP $C2C4
      return;
    }
  }
  shotsVsTerrain(state, res);                     // $C2C4
}

/**
 * `$C2C4-$C2FE` -- the six SHOT slots against the terrain, then the tail gate.
 *
 *   C2C4  A2 05 / 86 A8                X = $A8 = 5 down to 0 (object slots 3-8)
 *   C2C8  A6 A8 / 20 AF C3  JSR $C3AF / F0 1E BEQ $C2ED
 *   ...   the shot-hits-terrain resolution -- WAVE 6
 *   C2ED  C6 A8 / 10 D7     DEC $A8 / BPL $C2C8
 *   C2F1  AD 00 01 / C9 02 / B0 07     dying -> $C2FF anyway
 *   C2F8  A5 19 / C9 02 / D0 01 / 60   alive on stage 3 -> RTS
 *   C2FF  the enemy bullets versus the terrain
 *
 * `$C3AF` starts `LDA $0123,X / BEQ $C40E`, i.e. it returns 0 for an empty shot
 * slot, so with no weapons this is six iterations of nothing -- but the LOOP is
 * ported, and an occupied slot throws.
 */
function shotsVsTerrain(state, res) {
  const o = state.obj;
  let iters = 0;
  for (let x = 5; x >= 0; x--) {                  // $C2C4 / $C2ED / $C2EF
    state.spawn.zA8 = x;                          // $C2C6 STX $A8
    iters += 1;
    if (o.anim[3 + x] !== 0) {                    // $C3AF LDA $0123,X / BEQ
      throw new Error(`$C3AF: shot slot ${3 + x} holds metasprite `
                    + `${hex2(o.anim[3 + x])}. The shot-vs-terrain probe `
                    + `($C3AF-$C3D1's type-1 +$0A X offset and +3 Y offset for `
                    + `slots >= 6) and $C32F (the wall-breaking VRAM patch) are `
                    + `wave 6.`);
    }
  }
  state.spawn.zA8 = 0xFF;                         // $C2ED's DEC failed the BPL
  if (iters !== 6) throw new Error(`$C2C4 ran ${iters} slots, not 6`);
  // $C2F1: a DYING ship still runs the bullet-vs-terrain loop; an ALIVE one on
  // stage 3 ($19 == 2) does not. Both arms are the ROM's, in the ROM's order.
  if (state.obj.status[0] < 2 && state.zp19 === 2) return;   // $C2FE RTS
  bulletsVsTerrain(state, res);                   // $C2FF
}

/**
 * `$C2FF-$C32E` -- the ten enemy bullets against the terrain.
 *
 *   C2FF  A2 09 / 86 A8
 *   C303  A6 A8 / BD 36 01  LDA $0136,X / F0 20 BEQ $C32A
 *   ...   $C31C JSR $C3D3 / BEQ / free the slot through $AEF8
 *   C32A  C6 A8 / 10 D5     DEC $A8 / BPL $C303
 *
 * NOT PORTED for the same reason as $C20A: slots 22-31 are never populated.
 */
function bulletsVsTerrain(state, res) {
  const o = state.obj;
  let iters = 0;
  for (let x = 9; x >= 0; x--) {                  // $C2FF / $C32A / $C32C
    state.spawn.zA8 = x;                          // $C301 STX $A8
    iters += 1;
    if (o.anim[22 + x] !== 0) {                   // $C305 LDA $0136,X / BEQ
      throw new Error(`$C305: enemy-bullet slot ${22 + x} holds metasprite `
                    + `${hex2(o.anim[22 + x])}. $C30A-$C327 (the +8 Y offset for `
                    + `$0316,X == 0, the $C3D3 probe and the free through `
                    + `$AEF8) is not ported -- slots 22-31 are excluded.`);
    }
  }
  state.spawn.zA8 = 0xFF;                         // $C32A's DEC failed the BPL
  if (iters !== ENEMY_SLOTS) {
    throw new Error(`$C2FF ran ${iters} slots, not ${ENEMY_SLOTS}`);
  }
}
