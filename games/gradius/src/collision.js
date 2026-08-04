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
//   $C13D/$C159  the type $27 and $29 contact arms (1UP, $844B)   unmeasured
//   $C263-$C2A4  the stage-5 destructible-block sweep             stage 5
//   $C05F-$C08D  the ARMOURED branch of $C055                     unexercised
//   $C099        the type-$9A hit counter and its $BFC5 threshold unexercised
//   $C2DC        the wall-breaking VRAM patch ($C32F)             unexercised
//   $EC1E        PLAYED as of wave 8 (src/sound.js). The requests are still
//                RECORDED in state.sfx as well, because most of them are
//                REJECTED on priority and the call still has to have happened.
//
// $BFE6-$C047 (the inner sweep), $C055 (the hit resolver) and $C2C4's body
// (shots versus the terrain) WERE on that list and are ported here -- wave 6.
// $C18C (the every-16th item), $C1AF (the capsule pickup) and $C1C1 (the shield)
// were on it too, tagged "wave 7", and are ported here -- wave 7.
//
// THE THREE ENEMY-BULLET ENTRIES ($C20A, $C2FF, $BF7D) WERE ON IT UNTIL WAVE 11,
// under the reasoning "slots 22-31 are never populated". They now have bodies.
// The reasoning was true of the CORPUS and false of the cartridge, and the way
// that was discovered was a player flying left of an enemy and the game
// freezing (05-FINDING-enemy-bullets-reached-in-play.md). The route into $C1D6
// list above changes with them: `$C24B ... 0` was a measurement of a corpus that
// could not produce a bullet. MEASURED THIS WAVE, with the $040C countdown poked
// so ten enemies fire: $C24B fires at f500 on `enemy-bullet` and at f513 on the
// shielded variant, after $C24E has absorbed five.

import { u8, ENEMY_BASE, ENEMY_SLOTS, ARM_POOL } from './state.js';
import { probeCollision } from './terrain.js';
import { killEnemy, freeSlot } from './enemies.js';
import { scoreKill } from './score.js';
import { pickupCapsule } from './powerup.js';
import { soundRequest } from './sound.js';

// `hex2` used to live here for the $C05F armoured throw's message. That arm is
// ported (wave 22) and nothing else in this file formats a byte, so the helper
// is gone rather than left behind unused.

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
    if (o.anim[3 + x] !== 0) shotVsEnemies(state, res, x);   // $BFE8 BEQ $C047
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
 * `$BFED-$C044` -- ONE live shot against the ten enemy slots.
 *
 *   BFED  BC 63 01  LDY $0163,X                  the shot's SUBTYPE
 *   BFF0  BD 63 03  LDA $0363,X / 18 / 79 CE BF ADC $BFCE,Y
 *   BFF7  90 02     BCC $BFFB / A9 FF LDA #$FF   <- SATURATES, it does not wrap
 *   BFFB  85 A0     STA $A0                      the hit point's X
 *   BFFD  B9 D2 BF  LDA $BFD2,Y / 85 A3 STA $A3  the shot's WIDTH ($30 = laser)
 *   C002  BD 23 03  LDA $0323,X / 18 / 79 D6 BF ADC $BFD6,Y / 85 A1 STA $A1
 *   C00B  A2 09     LDX #$09 / 86 A9 STX $A9
 *   C00F  A4 A9     LDY $A9
 *   C011  B9 0C 03  LDA $030C,Y / 10 1A BPL $C030    not INITIALISED -> skip
 *   C016  A5 A0     LDA $A0 / 38 SEC / F9 6C 03 SBC $036C,Y
 *   C01C  C5 A3     CMP $A3 / B0 10 BCS $C030        dx >= the SHOT's width
 *   C020  BE 60 04  LDX $0460,Y                      the ENEMY's box class
 *   C023  A5 A1     LDA $A1 / F9 2C 03 SBC $032C,Y   <- SBC, carry CLEAR: -1
 *   C028  DD DE BF  CMP $BFDE,X / B0 03 BCS $C030    dy >= the enemy's HEIGHT
 *   C02D  20 55 C0  JSR $C055                        A HIT
 *   C030  20 75 BF  JSR $BF75                        shot vs enemy BULLET
 *   C033  C6 A9     DEC $A9 / 10 D8 BPL $C00F
 *   C037  A5 19     LDA $19 / C9 04 CMP #$04 / D0 0A BNE $C047   stage 5 only
 *
 * FOUR THINGS THAT ARE NOT SYMMETRIC WITH THE PLAYER SWEEP AT `$C101`:
 *
 *  1. dx is compared against the SHOT's width ($A3, from $BFD2,Y) and dy
 *     against the ENEMY's height ($BFDE,X). The enemy's WIDTH table $BFDA is
 *     not read here at all -- so a laser is $30 wide against every enemy, and
 *     that one byte is the whole of "the laser reaches further".
 *  2. there is no `BCC` after `$C019 SBC $036C,Y`, so a shot LEFT of the enemy
 *     wraps to a large dx and the CMP rejects it. The player sweep has one.
 *  3. `$C011 BPL $C030` is the spawn-frame invulnerability again (bit 7 of
 *     $030C = the initialised flag), and here it skips the enemy without
 *     consuming the shot -- unlike `$C055`'s own `BPL $C0B7`, which consumes it.
 *  4. `$C030 JSR $BF75` runs on EVERY iteration, hit or miss, and it is what
 *     lets a shot destroy an enemy bullet. MEASURED: $BF75 ran 2482 times over
 *     300 frames of held A and $BF7D -- its first instruction past the empty
 *     slot -- ran 0 times, because slots 22-31 were never populated here.
 *     RE-MEASURED IN WAVE 11 with the bullet path ported and the countdown
 *     poked so ten enemies fire: $BF75 6651 and 1473 entries in two runs with A
 *     held, and $BF7D STILL 0 both times. The reason is no longer an empty pool
 *     -- it is the geometry: the shot's box is $10 x $10 around a point 8 px
 *     right and 8 px down of the shot, and a bullet aimed at the ship does not
 *     pass through it in either configuration tried. $BF7D's body is ported and
 *     NO SCENARIO REACHES IT; three unit tests are all that hold it.
 *
 * The inner loop is TEN iterations unless `$C055` frees the shot, which sets
 * `$A9 = 0` at `$C0BB` and so makes `$C033`'s DEC/BPL fall out one iteration
 * later. That is a state transition, not a work budget: the laser (which does
 * NOT free itself) always runs all ten, and the shots that do free themselves
 * are the reason `$C115`'s counterpart in wave 5 measured nine short.
 */
function shotVsEnemies(state, res, x) {
  const o = state.obj;
  const w = res.weaponTables;
  const box = res.collisionTables;
  const i = 3 + x;
  const sub = o.animFrame[i];                     // $BFED LDY $0163,X
  const sumX = o.x[i] + w.read(0xBFCE + sub);     // $BFF0-$BFF6
  const a0 = sumX > 0xFF ? 0xFF : sumX;           // $BFF7 BCC / $BFF9 LDA #$FF
  const a3 = w.read(0xBFD2 + sub);                // $BFFD LDA $BFD2,Y -> $A3
  const a1 = u8(o.y[i] + w.read(0xBFD6 + sub));   // $C002-$C009 -> $A1
  // THE LOOP INDEX IS `$A9` ITSELF, not a JS counter, because `$C055`'s free
  // WRITES IT ($C0BB STA $A9 with A = 0) and `$C033 DEC $A9 / BPL` is what
  // reads it back. That is how a consumed shot stops sweeping -- and it is also
  // why `$C030 JSR $BF75` is handed $A9 rather than the enemy index this
  // iteration started with.
  let iters = 0;
  let freed = false;
  state.spawn.zA9 = 9;                            // $C00B LDX #$09 / $C00D STX
  for (;;) {
    const j = state.spawn.zA9;                    // $C00F LDY $A9
    iters += 1;
    const e = j + ENEMY_BASE;
    if (o.type[e] & 0x80) {                       // $C011 LDA $030C,Y / BPL
      const dx = u8(a0 - o.x[e]);                 // $C016-$C019 SEC / SBC
      if (dx < a3) {                              // $C01C CMP $A3 / BCS $C030
        const cls = o.s0460[j];                   // $C020 LDX $0460,Y
        const dy = u8(a1 - o.y[e] - 1);           // $C023 LDA $A1 / SBC, carry 0
        if (dy < box.read(0xBFDE + cls)) {        // $C028 CMP $BFDE,X / BCS
          hitEnemy(state, res, j, x);             // $C02D JSR $C055
          if (state.spawn.zA9 === 0 && j !== 0) freed = true;
        }
      }
    }
    // $C030 JSR $BF75, and it is handed $A9 -- which $C055's free may already
    // have zeroed, so this can be called for enemy index 0 twice in a row.
    const bj = state.spawn.zA9;
    if (shotVsBullet(state, res, bj, x, a0, a1, a3) && bj !== 0) freed = true;
    state.spawn.zA9 = u8(state.spawn.zA9 - 1);    // $C033 DEC $A9
    if (state.spawn.zA9 & 0x80) break;            // $C035 BPL $C00F
  }
  // TEN, unless the shot was consumed part way through -- which is a state
  // transition (the slot is empty afterwards and the compared fields show it),
  // not docs/knowledge/06 mechanism (C). A laser never takes the short exit.
  if (iters !== ENEMY_SLOTS && !freed) {
    throw new Error(`$C00B ran ${iters} enemies for shot slot ${i}, not `
                  + `${ENEMY_SLOTS}, and the shot was not consumed`);
  }
  if (state.zp19 === 4) {                         // $C037/$C039 CMP #$04
    // W32a CORRECTION: not "destructible blocks". $BEF3/$BF0B walks the six
    // SEGMENTS of each live $0600 arm group; only segment 2 is vulnerable
    // ($BF31 CMP #$02), and the hit count comes from $BEEA,$17 (9 rank rows,
    // 2..9 hits). See docs/worklog/gradius/32-recon-destructible-terrain.md.
    throw new Error('$C03D: $19 = 4 (stage 5). The second sweep at $C03D-$C046 '
                  + '($BEF3, a shot against the $0600 ARM SEGMENTS -- not '
                  + 'destructible terrain, see 32-recon-destructible-terrain.md) '
                  + 'is not ported. W32c.');
  }
}

/**
 * `$BF75-$BFC4` -- the same live shot against the ten ENEMY BULLET slots.
 *
 *   BF75  A4 A9     LDY $A9 / B9 16 03 LDA $0316,Y / D0 01 BNE $BF7D / 60 RTS
 *   BF7D  A5 A1     LDA $A1 / 38 / F9 36 03 SBC $0336,Y / C9 10 CMP #$10 / B0 F5
 *   BF87  A5 A0     LDA $A0 / F9 76 03 SBC $0376,Y / C5 A3 CMP $A3 / B0 EC
 *   BF90  B9 16 03  LDA $0316,Y / C9 02 CMP #$02 / D0 08 BNE $BF9F
 *   BF97  A9 05     LDA #$05 / 20 1E EC JSR $EC1E / 4C B7 C0 JMP $C0B7
 *   BF9F  E6 5D     INC $5D    ... free the bullet, JSR $8463, sfx $09 ...
 *
 * NOT PORTED past the empty-slot RTS, and that is one instruction: `$0316,Y` is
 * the type byte of bullet slot 22 + j, which is 0 on every frame of every run
 * made here (src/enemies.js $BC59 is a throw for the same reason). MEASURED:
 * $BF75 entered 2482 times and $BF7D 0 times over 300 frames of held A.
 *
 * Note what a port that skipped this call would lose: `$BF9F INC $5D`, which is
 * the byte the enemy-bullet engine gates on, and a `JSR $8463` -- shooting a
 * bullet SCORES.
 *
 * PORTED IN WAVE 11 (the numbers above are the pre-wave-11 measurement and are
 * kept, because they are what the exclusion rested on). Three asymmetries with
 * the enemy sweep three lines up, all of them the ROM's:
 *
 *  1. **Y is tested FIRST**, against the constant `#$10`, and only then X
 *     against the SHOT's width `$A3`. The enemy sweep is the other way round.
 *  2. `$BF87 LDA $A0 / SBC $0376,Y` inherits a CLEAR carry from the `CMP #$10`
 *     that just fell through, so dx is one less than the difference -- the same
 *     `- 1` the enemy sweep has on its dy, on the other axis.
 *  3. **The bullet's own type decides who dies.** Type 2 (`$BF90`) makes the
 *     SHOT the casualty: sfx $05, `JMP $C0B7`, and the bullet survives. Every
 *     other type is destroyed, and then the metasprite id decides whether the
 *     shot is consumed too: `$BFBB CMP #$59 / BEQ $BFC2` sends kind 1 straight
 *     to the free while everything else goes through `$C0AE`, where a LASER
 *     survives its own hit.
 *
 * @returns {boolean} true if the shot slot was freed ($C0B7 zeroes $A9 and so
 *                    ends the caller's inner sweep)
 */
function shotVsBullet(state, res, j, x, a0, a1, a3) {
  const o = state.obj;
  const type = o.type[22 + j];                    // $BF77 LDA $0316,Y
  if (type === 0) return false;                   // $BF7A BNE $BF7D / $BF7C RTS
  const dy = u8(a1 - o.y[22 + j]);                // $BF7D LDA $A1 / SEC / SBC
  if (dy >= 0x10) return false;                   // $BF83 CMP #$10 / BCS $BF7C
  const dx = u8(a0 - o.x[22 + j] - 1);            // $BF87 LDA $A0 / SBC, carry CLEAR
  if (dx >= a3) return false;                     // $BF8C CMP $A3 / BCS $BF7C
  if (o.type[22 + j] === 2) {                     // $BF90/$BF93 CMP #$02 / BNE
    soundRequest(state, 0x05);                    // $BF97/$BF99 JSR $EC1E
    freeShotSlot(state, x);                       // $BF9C JMP $C0B7
    return true;
  }
  state.spawn.z5D = u8(state.spawn.z5D + 1);      // $BF9F INC $5D
  const ms = o.anim[22 + j];                      // $BFA1 LDX $0136,Y / STX $AA
  o.anim[22 + j] = 0;                             // $BFA6/$BFA8 STA $0136,Y
  o.animFrame[22 + j] = 0;                        // $BFAB STA $0176,Y
  o.type[22 + j] = 0;                             // $BFAE STA $0316,Y
  scoreKill(state);                               // $BFB1 JSR $8463 -- +$0010
  soundRequest(state, 0x09);                      // $BFB4/$BFB6 JSR $EC1E
  if (ms === 0x59) { freeShotSlot(state, x); return true; }   // $BFBB/$BFBD/$BFC2
  // $BFBF JMP $C0AE -- the laser test, then $C0B7's free by fall-through.
  if (o.animFrame[3 + x] === 1) return false;     // $C0AE-$C0B5: the LASER lives
  freeShotSlot(state, x);
  return true;
}

/**
 * `$C055-$C0C6` -- WHAT A HIT MEANS. Four outcomes, and the shot is consumed in
 * three of them.
 *
 *   C055  B9 0C 03  LDA $030C,Y / 10 5D BPL $C0B7    spawn-frame invulnerable
 *   C05A  B9 0C 01  LDA $010C,Y / 10 31 BPL $C090    ORDINARY: go and kill it
 *   C05F  B9 2C 01  LDA $012C,Y / F0 0C BEQ $C070    ARMOURED, from here down
 *   C064  B9 0C 03  LDA $030C,Y / C9 94 CMP #$94 / F0 05 BEQ $C070
 *   C06B  A9 05     LDA #$05 / 20 1E EC JSR $EC1E    the "clink"
 *   C070  B9 8C 04  LDA $048C,Y / F0 42 BEQ $C0B7
 *   C075  A6 A9     LDX $A9 / A9 01 LDA #$01 / BC 60 04 LDY $0460,X / F0 08 BEQ
 *   C07E  A4 A8     LDY $A8 / C0 06 CPY #$06 / 90 02 BCC $C086 / A9 02 LDA #$02
 *   C086  18        CLC / 7D 6C 04 ADC $046C,X / 9D 6C 04 STA $046C,X
 *   C08D  4C B7 C0  JMP $C0B7
 *   C090  A6 A9     LDX $A9 / BD 0C 03 LDA $030C,X / C9 9A CMP #$9A / D0 0D BNE
 *   C099  FE AC 04  INC $04AC,X / BD AC 04 LDA $04AC,X / A4 17 LDY $17
 *   C0A1  D9 C5 BF  CMP $BFC5,Y / 90 08 BCC $C0AE   not enough hits yet
 *   C0A6  20 63 84  JSR $8463                       +$0010 -- THE SCORE
 *   C0A9  A4 A9     LDY $A9 / 20 93 BE JSR $BE93    THE KILL
 *   C0AE  A6 A8     LDX $A8 / BD 63 01 LDA $0163,X / C9 01 CMP #$01 / F0 0F BEQ
 *   C0B7  A9 00     LDA #$00 / A6 A8 LDX $A8 / 85 A9 STA $A9
 *   C0BB  9D 23 01  STA $0123,X / 9D 63 01 STA $0163,X / 9D 03 01 STA $0103,X
 *   C0C6  60        RTS
 *
 * THE LASER SURVIVES ITS OWN HIT. `$C0AE CMP #$01 / BEQ $C0C6` returns without
 * running the free, so subtype 1 keeps flying AND keeps sweeping -- which is why
 * `$44 = 1` kills 18 enemies in the window where `$44 = 0` kills 11 (MEASURED,
 * this wave's own flowprobe runs). Every other subtype is consumed, and the
 * free also zeroes `$A9`, ending the inner loop.
 *
 * `$C0B7` IS THE FALL-THROUGH TARGET OF THE KILL, not an else-branch: after
 * `$BE93` returns, execution runs into `$C0AE` and then into `$C0B7` unless the
 * laser test jumps over it. Three of the four outcomes share those four stores.
 */
function hitEnemy(state, res, j, x) {
  const o = state.obj;
  const e = j + ENEMY_BASE;
  if (!(o.type[e] & 0x80)) { freeShotSlot(state, x); return; }   // $C058 BPL
  if (o.status[e] & 0x80) {                       // $C05D BPL $C090
    // ---- $C05F-$C08D: the ARMOURED branch -------------------------------
    //
    // PORTED IN WAVE 22, and it had to be: it is not an optional extra to the
    // hatches, it IS how they take damage. `$AF3B LDA #$80 / STA $010C,X` sets
    // this bit, `$AF38 STA $048C,X` opens $C070's gate, and `$AF57 LDY $046C,X`
    // reads the accumulator this arm fills. Leave this a throw and entries 15
    // and 16 are invulnerable AND the first shot fired at one crashes.
    //
    // WHAT IT USED TO SAY, kept because it is the reason it was not ported
    // sooner and it is the same shape of sentence this project keeps finding:
    // "MEASURED: $C070 ran 0 times in every run made here, and no stage-1
    // squadron sets the bit." Both halves were TRUE and the conclusion drawn
    // from them was wrong -- no stage-1 SQUADRON sets it, the stage-1 HATCHES
    // do, and no run made here had ever reached one.
    //
    // $C05F LDA $012C,Y / BEQ $C070 -- a metasprite of 0 makes NO sound, and
    // $C064 CMP #$94 exempts exactly one type (the $0600-page object, entry 20).
    if (o.anim[e] !== 0 && o.type[e] !== 0x94) {
      soundRequest(state, 0x05);                  // $C06B LDA #$05 / JSR $EC1E
    }
    if (o.s0480[e] === 0) { freeShotSlot(state, x); return; }   // $C070 BEQ $C0B7
    // $C075 LDX $A9 / LDA #$01 / LDY $0460,X / BEQ $C086 -- box class 0 always
    // takes 1. Only a class != 0 enemy consults the WEAPON, and then $A8 >= 6
    // (a MISSILE slot, 6/7/8) doubles it. $A8 is the sweep's own weapon index,
    // set at $BFE4.
    let dmg = 1;                                  // $C077 LDA #$01
    if (o.s0460[j] !== 0 && state.spawn.zA8 >= 6) dmg = 2;   // $C07E-$C084
    o.s0460[e] = u8(o.s0460[e] + dmg);            // $C086 CLC / ADC $046C,X / STA
    freeShotSlot(state, x);                       // $C08D JMP $C0B7
    return;
  }
  if (o.type[e] === 0x9A) {                       // $C092/$C095 CMP #$9A
    throw new Error('$C099: a type-$9A enemy took a hit. The per-enemy hit '
                  + 'counter ($04AC,X) and its threshold $BFC5[$17] are not '
                  + 'ported -- $C099 ran 0 times in every measured run. $17 '
                  + '(the power-up rank) IS live since wave 7 (src/powerup.js '
                  + '$9C45), so only $BFC5 and the counter are missing.');
  }
  scoreKill(state);                               // $C0A6 JSR $8463
  killEnemy(state, res, j);                       // $C0A9 JSR $BE93
  if (o.animFrame[3 + x] === 1) return;           // $C0AE-$C0B5: the LASER lives
  freeShotSlot(state, x);                         // $C0B7 (fall-through)
}

/** `$C0B7-$C0C5` -- free the shot AND end the inner sweep ($A9 = 0). */
function freeShotSlot(state, x) {
  const o = state.obj;
  state.spawn.zA9 = 0;                            // $C0BB STA $A9
  o.anim[3 + x] = 0;                              // $C0BD STA $0123,X
  o.animFrame[3 + x] = 0;                         // $C0C0 STA $0163,X
  o.status[3 + x] = 0;                            // $C0C3 STA $0103,X
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
  // $C25D: LDA $19 / CMP #$04 / BNE $C2A5 -- and the stage-5 arm ENDS AT
  // $C2A4 RTS, so on stage 5 this routine never reaches $C2A5 at all. The
  // terrain part's own `$C2AB CMP #$04 / RTS` covers the other way in ($C0F7,
  // the dying ship), which is why stage 5 has no terrain collision anywhere.
  if (state.zp19 === 4) {                         // $C25D/$C25F/$C261 BNE $C2A5
    if (playerVsArms(state)) {                    // $C263-$C2A4, $C290 -> $C1D6
      shotsVsTerrain(state, res);                 // $C1D6 ... JMP $C2C4
    }
    return;                                       // $C2A4 RTS
  }
  terrainPart(state, res);                        // $C2A5
}

/**
 * `$C263-$C2A4` -- THE PLAYER'S BODY AGAINST THE ARM SEGMENTS. Wave 32b.
 *
 *   C263  LDX #$90 / STX $A9
 *   C267  LDX $A9 / LDA $0600,X / BEQ $C29B        group free -> next
 *   C26E  LDA #$05 / STA $AB / TXA / CLC / ADC #$05 / STA $AA
 *   C278  LDX $AA / LDA $A0 / SBC $0618,X / CMP #$0A / BCS $C295
 *   C283  LDA $A4 / SBC $0620,X / CMP #$0A / BCS $C295
 *   C28C  LDA $46 / BNE $C293 / JMP $C1D6          NO SHIELD -> DEATH
 *   C293  DEC $46
 *   C295  DEC $AA / DEC $AB / BPL $C278
 *   C29B  LDA $A9 / SEC / SBC #$30 / STA $A9 / BPL $C267 / RTS
 *
 * `$A0` and `$A4` are `$C20A`'s FIRST base pair -- the raw `$0360`/`$0320`, not
 * the +6/+8 variants at `$A1`/`$A5`. They were set two instructions' worth of
 * loop earlier, in playerVsBullets, and are still live here. The port reads
 * `o.x[0]`/`o.y[0]` and says so rather than threading them through, because
 * `$C20A` writes them unconditionally on every frame that reaches `$C25D`.
 *
 * **NEITHER SUBTRACT HAS A `SEC`.** The carry is whatever the previous
 * `CMP #$0A` left, and the first iteration inherits `$C274 ADC #$05` (clear).
 * So the box is 10 px wide and 10 px tall on any iteration entered after a
 * rejected test, and 11 px on the first -- the classic unsigned distance idiom
 * this file already carries at `$C12C` and `$BF87`, and it is transcribed the
 * same way for the same reason.
 *
 * Being ABOVE or LEFT of a segment wraps the difference to a large number and
 * the `CMP` rejects it, so the box is one-sided, exactly like `$C101`'s.
 *
 * The shield does NOT end the sweep: `$C293 DEC $46` falls into the loop tail,
 * so one frame can spend several shield points against several segments -- the
 * same shape `$C24E` has for bullets.
 *
 * ALL SIX SEGMENTS ARE TESTED, including segment 2. There is no exemption here;
 * the "only segment 2 is vulnerable" rule is `$BF31`'s, and that is the SHOT
 * sweep ($BEF3, W32c), not this one.
 *
 * @returns {boolean} true if a segment killed the ship (`$C290 JMP $C1D6`)
 */
function playerVsArms(state) {
  const c = state.coll;
  const px = state.obj.x[0];                      // $A0, from $C20E/$C211
  const py = state.obj.y[0];                      // $A4, from $C21A/$C21D
  for (let base = 0x90; !(base & 0x80); base = u8(base - 0x30)) {   // $C263/$C29B
    if (c[ARM_POOL + base] === 0) continue;       // $C269/$C26C BEQ $C29B
    let carry = 0;                                // $C273 CLC / $C274 ADC #$05
    for (let seg = 5; seg >= 0; seg--) {          // $C26E $AB = 5 / $C295-$C299
      const dx = px - c[ARM_POOL + base + 0x18 + seg] - (1 - carry);  // $C27C SBC
      carry = dx >= 0 ? 1 : 0;
      if (u8(dx) >= 0x0A) { carry = 1; continue; }    // $C27F/$C281 CMP / BCS $C295
      carry = 0;                                  // the CMP fell through
      const dy = py - c[ARM_POOL + base + 0x20 + seg] - (1 - carry);  // $C285 SBC
      carry = dy >= 0 ? 1 : 0;
      if (u8(dy) >= 0x0A) { carry = 1; continue; }    // $C288/$C28A CMP / BCS $C295
      carry = 0;
      if (state.zp.shield === 0) {                // $C28C/$C28E LDA $46 / BNE $C293
        die(state);                               // $C290 JMP $C1D6
        return true;
      }
      state.zp.shield = u8(state.zp.shield - 1);  // $C293 DEC $46
    }
  }
  return false;                                   // $C2A4 RTS
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
 * `$C18C` also leaves early (`JMP $C20A`), and that is a state transition too:
 * it has just destroyed every enemy on screen, so there is nothing left to sweep.
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
    const out = contact(state, res, j, type);     // $C16E ...
    if (out === DIED) return true;                // $C1D6
    // $C1AC JMP $C20A -- and note $A8 is NOT reset: $C18C's own loop walks Y,
    // so the sweep's index is left pointing at the slot that was touched.
    if (out === TO_BULLETS) return false;
  }
  state.spawn.zA8 = 0xFF;                         // $C136's DEC failed the BPL
  if (iters !== ENEMY_SLOTS) {
    throw new Error(`$C101 ran ${iters} slots, not ${ENEMY_SLOTS}`);
  }
  return false;                                   // $C13A JMP $C20A
}

// The three places `$C16E`'s dispatch can end. They are the ROM's three jump
// targets, not an abstraction: `$C136` is the loop tail, `$C1D6` the death, and
// `$C1AC JMP $C20A` abandons the loop after $C18C has cleared the screen.
const NEXT_SLOT = 'C136', DIED = 'C1D6', TO_BULLETS = 'C20A';

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
 * STATUS 6 AND STATUS 7 ARE TWO DIFFERENT PICKUPS AND ONLY ONE IS THE METER.
 * `$AEC8 INC $47 / AND #$0F` gives the promoted object status 7 on every 16th
 * capsule; 7 falls PAST the `CMP #$06 / BEQ` into `$C18C`, which never calls
 * `$894B` at all (00-recon-powerups.md 1, measured by poking `$47 = 15`: type 7,
 * `$C18C` n=1, `$C1AF` n=0, `$894B` n=0, and every enemy on screen turned into an
 * explosion in one frame).
 *
 * @returns {string} NEXT_SLOT ($C136), DIED ($C1D6) or TO_BULLETS ($C1AC)
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
  if (t !== 1) return NEXT_SLOT;                  // $C181 BNE $C136 (type 2)
  const status = o.status[i];                     // $C183 LDA $010C,Y
  if (status === 0) return NEXT_SLOT;             // $C186 BEQ $C136
  if (status === 6) {                             // $C188/$C18A CMP #$06
    // $C1AF  20 FD C1  JSR $C1FD / 20 4B 89 JSR $894B / 4C 36 C1 JMP $C136
    freeSlot(state, j);                           // $C1FD TYA / TAX / JMP $AEF8
    pickupCapsule(state, res);                    // $C1B2 JSR $894B
    return NEXT_SLOT;                             // $C1B5 JMP $C136 -- keep going
  }
  return everyEnemy(state, res, j);               // $C18C
}

/**
 * `$C18C-$C1AC` -- the EVERY-16TH item: free it, and blow up the whole screen.
 *
 *   C18C  20 FD C1  JSR $C1FD              free the item itself
 *   C18F  A9 0B     LDA #$0B / 20 1E EC    sfx $0B -- NOT the capsule's $0D
 *   C194  A0 09     LDY #$09
 *   C196  B9 0C 01  LDA $010C,Y / 30 0E BMI $C1A9    status bit 7 SET -> skip
 *   C19B  B9 0C 03  LDA $030C,Y / 10 09 BPL $C1A9    NOT initialised -> skip
 *   C1A0  29 7F     AND #$7F / C9 03 CMP #$03 / 90 03 BCC $C1A9
 *   C1A6  20 93 BE  JSR $BE93
 *   C1A9  88        DEY / 10 EA BPL $C196
 *   C1AC  4C 0A C2  JMP $C20A     <- LEAVES THE PLAYER SWEEP ENTIRELY
 *
 * TWO THINGS A RE-IMPLEMENTATION GETS WRONG. First, `$C1AC` is `JMP $C20A`, not
 * `JMP $C136`: unlike the capsule, this arm ABANDONS the remaining enemy slots
 * and goes straight to the bullet sweep. Second, the loop uses Y from 9 down to
 * 0 while the enclosing sweep's index lives in `$A8`, so `$A8` is left pointing
 * at whatever slot was touched -- and `$C1C8` reads `$A8`.
 *
 * NO SCENARIO IN THE CORPUS REACHES THIS, and it is ported anyway rather than
 * left a throw, for one reason written down so it is not undone: `$47` has to
 * reach 16 promotions in a single life, the corpus's best is 2, and `$47` is not
 * a pokeable address -- but a REAL PLAYER reaches it, and an unported throw here
 * is a frozen game (docs/worklog/gradius/05-FINDING-enemy-bullets-reached-in-
 * play.md is the same mistake, found the hard way). What holds it is
 * tests/powerup.test.js, driven off 00-recon-powerups.md 1's `--poke 47=15` run:
 * type 7, `$C18C` n=1, `$C1AF` n=0, `$894B` n=0, all ten enemy slots -> class 2.
 *
 * @returns {string} always TO_BULLETS -- $C1AC is `JMP $C20A`
 */
function everyEnemy(state, res, j) {
  const o = state.obj;
  freeSlot(state, j);                             // $C18C JSR $C1FD
  soundRequest(state, 0x0B);                      // $C18F/$C191 JSR $EC1E
  for (let y = 9; y >= 0; y--) {                  // $C194 LDY #$09 / $C1A9 DEY
    const i = y + ENEMY_BASE;
    if (o.status[i] & 0x80) continue;             // $C199 BMI $C1A9
    if (!(o.type[i] & 0x80)) continue;            // $C19E BPL $C1A9
    if ((o.type[i] & 0x7F) < 3) continue;         // $C1A0-$C1A4 BCC $C1A9
    killEnemy(state, res, y);                     // $C1A6 JSR $BE93
  }
  return TO_BULLETS;                              // $C1AC JMP $C20A
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
 *
 * THE SHIELD IS FIVE HITS AND THE SIXTH KILLS, and both halves are one measured
 * run (`--poke 46=5@400-400` on `600:R`, 00-recon-powerups.md 7 re-run here):
 *
 *   $46  5 (f401) -> 4 (f493) -> 3 (f509) -> 2 (f526) -> 1 (f542) -> 0 (f647)
 *   $C1BD n=6   $C1C1 n=5   $C1D0 n=5   $BE93 n=5   $C1D6 n=1
 *
 * and `capsule-shield` -- the same intervention as a corpus scenario -- puts the
 * death at f658, 165 frames after the contact that kills a SHIELDLESS ship at
 * f493 in `right-wall`. Those two scenarios are the same script with one poked
 * byte between them, which is what makes "absorbed" separable from "immune".
 *
 * DESTROY-WHAT-YOU-HIT IS THE DEFAULT ARM, not the exception: `$C1C6 BPL $C1D0`
 * takes the kill when `$010C,Y`'s bit 7 is CLEAR, and bit 7 there is the armoured
 * flag, which no stage-1 squadron sets ($C1D0 n=5 of 5 above). The armoured tail
 * ($C1C8 INC $046C,X) is the same damage accumulator $C070 uses and is equally
 * unexercised -- it is ported, in one line, because it is one line and because
 * leaving it out would silently make an armoured enemy free.
 *
 * WHAT THE SHIELD DOES NOT PROTECT AGAINST: terrain. `$C2B5`-`$C2C1` probes the
 * map and `JMP $C1D6` with no `$46` test anywhere (see terrainPart below). The
 * recon could not reach it -- $C3A3 returned 0 on all 1746 calls -- so that is
 * the listing read carefully, and `terrain-death` still kills a shieldless ship.
 */
function armedEnemy(state, res, j) {
  const o = state.obj;
  const i = j + ENEMY_BASE;
  if (!(o.type[i] & 0x80)) return NEXT_SLOT;      // $C1BB BPL $C1CD
  if (state.zp.shield === 0) { die(state); return DIED; }   // $C1BF BEQ $C1D6
  state.zp.shield = u8(state.zp.shield - 1);      // $C1C1 DEC $46
  if (!(o.status[i] & 0x80)) {                    // $C1C6 BPL $C1D0
    killEnemy(state, res, j);                     // $C1D0 JSR $BE93
    return NEXT_SLOT;                             // $C1D3 JMP $C136
  }
  // $C1C8 LDX $A8 / INC $046C,X -- X is the sweep's own index, so this is
  // $0460[j + 12] in the port's addressing (state.js: $046C = $0460 + 12).
  o.s0460[i] = u8(o.s0460[i] + 1);                // $C1CA INC $046C,X
  return NEXT_SLOT;                               // $C1CD JMP $C136
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
 *   C1F5  A9 F7 / 20 1E EC          sfx $F7 -- records $37-$3A, four channels
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
  soundRequest(state, 0xF7);                      // $C1F5 LDA #$F7 / JSR $EC1E
}

/**
 * `$C20A-$C259` -- the player against the ten ENEMY BULLET slots (22-31).
 *
 *   C20A  A2 09 / 86 A8
 *   C20E  AD 60 03 / 85 A0 / 18 / 69 06 / 85 A1 / 85 A2      three X bases
 *   C21A  AD 20 03 / 85 A4 / 18 / 69 08 / 85 A5 / 69 04 / 85 A6   three Y bases
 *   C228  A4 A8 / B9 36 01 LDA $0136,Y / F0 2A BEQ $C259
 *   C22F  BE 76 01  LDX $0176,Y     picks WHICH of the three bases ($A0,X)
 *   C232  B5 A0 / 38 / F9 76 03 / DD 02 C2 / B0 1C   dx vs $C202,X
 *   C23D  B5 A4 / F9 36 03 / DD 06 C2 / B0 12        dy vs $C206,X, carry CLEAR
 *   C247  A5 46 / D0 03 / 4C D6 C1                   no shield -> DEATH
 *   C24E  C6 46 / A9 0A / 18 / 65 A8 / AA / 20 F8 AE the shield eats the bullet
 *
 * PORTED IN WAVE 11. Four things worth naming:
 *
 *  1. **THE BOX CLASS IS THE BULLET'S OWN KIND, NOT AN ENEMY BOX CLASS.**
 *     `$0176,Y` was written by `$BC86` from `$BC66,Y`, i.e. 0 or 1, and it
 *     indexes a DIFFERENT table pair ($C202/$C206) from the enemy sweep's
 *     $BFDA/$BFDE. It also indexes the three zero-page bases: `$A0,X` and
 *     `$A4,X`, so a kind-1 bullet is measured against a point 6 px right and
 *     12 px down from a kind-0 one.
 *  2. **`$C224 ADC #$04` HAS NO `CLC`.** It inherits the carry from the
 *     `ADC #$08` two instructions earlier, so `$A6` is playerY + 12 + 1 when
 *     playerY + 8 wrapped. Transcribed, not tidied.
 *  3. **The shield does NOT end the sweep.** `$C24E` decrements `$46`, frees
 *     the bullet through `$AEF8` with X = $0A + $A8, and falls into the loop
 *     tail -- so one frame can absorb several bullets. MEASURED: with `$46 = 5`
 *     poked and ten bullets converging, `$C24E` ran at f493, 494, 498, 500, 503
 *     and `$C24B` then killed the ship at f513, five absorptions and a death.
 *  4. `$C24B` is a JMP into `$C1D6`, so the remaining bullet slots are not
 *     swept on that frame at all.
 *
 * @returns {boolean} true if a bullet killed the ship ($C24B)
 */
function playerVsBullets(state, res) {
  const o = state.obj;
  const box = res.collisionTables;
  // $C20E LDA $0360 / STA $A0 / CLC / ADC #$06 / STA $A1 / STA $A2
  const xb = [o.x[0], u8(o.x[0] + 6), u8(o.x[0] + 6)];
  // $C21A LDA $0320 / STA $A4 / CLC / ADC #$08 / STA $A5 / ADC #$04 / STA $A6
  const s1 = o.y[0] + 8;                          // $C21F CLC / ADC #$08
  // $C224 ADC #$04 with NO CLC. The inherited carry is DEAD on this cartridge
  // and it is worth saying so rather than leaving a reader to wonder: it can
  // only be set when playerY > 247, and $A052's clamp caps $0320 at $C0 = 192.
  // Measured: deleting the carry term is GREEN on all four scenarios and on the
  // unit suite. Transcribed because it is what the instruction does; $A6 is
  // doubly dead anyway, since only box class 2 would read it.
  const s2 = u8(s1) + 4 + (s1 > 0xFF ? 1 : 0);    // $C224 ADC #$04 -- NO CLC
  const yb = [o.y[0], u8(s1), u8(s2)];
  let iters = 0;
  for (let j = 9; j >= 0; j--) {                  // $C20A / $C259 / $C25B
    state.spawn.zA8 = j;                          // $C20C STX $A8
    iters += 1;
    const i = 22 + j;
    if (o.anim[i] === 0) continue;                // $C22A LDA $0136,Y / BEQ $C259
    const k = o.animFrame[i];                     // $C22F LDX $0176,Y
    if (k > 2) {
      // $A0,X and $A4,X with X = 3 read $A3 and $A7 -- zero-page scratch left
      // by whatever ran last, which this port does not model as addressable
      // bytes. Only $BC86 (0 or 1) and $AEF8 (0) write $0176 for a bullet on
      // any path that is ported, so reaching this needs one of the unported
      // producers ($B3B6/$B4A2).
      throw new Error(`$C22F: enemy-bullet slot ${i} has box class ${k}. `
                    + '$C232 LDA $A0,X and $C23D LDA $A4,X would read the '
                    + 'zero-page scratch at $A3/$A7, which this port does not '
                    + 'model -- only classes 0 and 1 have a base byte.');
    }
    const dx = u8(xb[k] - o.x[i]);                // $C232-$C235 SEC / SBC $0376,Y
    if (dx >= box.read(0xC202 + k)) continue;     // $C238 CMP $C202,X / BCS $C259
    const dy = u8(yb[k] - o.y[i] - 1);            // $C23D/$C23F SBC, carry CLEAR
    if (dy >= box.read(0xC206 + k)) continue;     // $C242 CMP $C206,X / BCS $C259
    if (state.zp.shield === 0) {                  // $C247 LDA $46 / $C249 BNE
      die(state);                                 // $C24B JMP $C1D6
      return true;
    }
    state.zp.shield = u8(state.zp.shield - 1);    // $C24E DEC $46
    // $C250 LDA #$0A / CLC / ADC $A8 / TAX / JSR $AEF8 -- the SHORT free, which
    // leaves the bullet's position and velocity bytes alone.
    freeSlot(state, u8(0x0A + j));                // $C256 JSR $AEF8
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
    const cell = shotProbe(state, x);             // $C2CA JSR $C3AF
    if (cell === 0) continue;                     // $C2CD BEQ $C2ED
    // $C2CF LDY $A3 / DEY / BMI / LSR / LSR / BNE -- shift the masked cell down
    // into its own 2-bit field. probeCollision() already returns it shifted (it
    // is the same arithmetic; $C40B `AND $C40F,Y` leaves the field IN PLACE and
    // every consumer either tests it for zero or shifts it down here).
    if (cell === 2) {                             // $C2D8 CMP #$02 / BNE $C2E8
      throw new Error(`$C2DC: shot slot ${3 + x} hit a BREAKABLE wall (field 2). `
                    + '$C32F (the VRAM patch that removes the block, $C34C\'s '
                    + 'queue append and the $0500 map update) is not ported -- '
                    + 'stage 1 pages 0-3 hold no solid tiles at all and $C2DC '
                    + 'ran 0 times in every measured run.');
    }
    // $C2E8 LDA #$00 / JSR $C0BD -- the shot is absorbed by solid terrain. Note
    // this is $C0BD, i.e. the LAST THREE stores of $C0B7's free, entered as a
    // subroutine: $A9 is NOT zeroed here, because this loop does not use it.
    o.anim[3 + x] = 0;                            // $C0BD STA $0123,X
    o.animFrame[3 + x] = 0;                       // $C0C0 STA $0163,X
    o.status[3 + x] = 0;                          // $C0C3 STA $0103,X
  }
  state.spawn.zA8 = 0xFF;                         // $C2ED's DEC failed the BPL
  if (iters !== 6) throw new Error(`$C2C4 ran ${iters} slots, not 6`);
  // $C2F1: a DYING ship still runs the bullet-vs-terrain loop; an ALIVE one on
  // stage 3 ($19 == 2) does not. Both arms are the ROM's, in the ROM's order.
  if (state.obj.status[0] < 2 && state.zp19 === 2) return;   // $C2FE RTS
  bulletsVsTerrain(state, res);                   // $C2FF
}

/**
 * `$C3AF-$C3D1` -- the SHOT half of the terrain probe's front end.
 *
 *   C3AF  BD 23 01  LDA $0123,X / F0 5A BEQ $C40E      empty slot -> returns 0
 *   C3B4  BD 23 03  LDA $0323,X
 *   C3B7  E0 06     CPX #$06 / 90 02 BCC $C3BD / 69 03 ADC #$03
 *   C3BD  85 A5     STA $A5
 *   C3BF  BD 63 01  LDA $0163,X / C9 01 CMP #$01 / D0 08 BNE $C3CE
 *   C3C6  BD 63 03  LDA $0363,X / 69 0A ADC #$0A / 4C D1 C3 JMP $C3D1
 *   C3CE  BD 63 03  LDA $0363,X
 *   C3D1  85 A4     STA $A4          ...and falls into $C3D3, probeCollision()
 *
 * BOTH ADCs TAKE A CARRY THE COMPARE ABOVE THEM JUST SET, and both are +1 more
 * than they read:
 *   * `CPX #$06` sets the carry exactly when X >= 6, which is the only way to
 *     reach `ADC #$03` -- so a MISSILE probes at Y + 4;
 *   * `CMP #$01` sets it on equality, and the laser arm is the EQUAL arm -- so
 *     a LASER probes at X + $0B.
 * src/collision.js said "+$0A X offset and +3 Y offset" in wave 5; both were
 * one too low and both are corrected here (rule 6). Neither is exercised by any
 * measured run -- the map is 0 everywhere the corpus reaches -- so this is the
 * listing read carefully, and it is labelled as such.
 */
function shotProbe(state, x) {
  const o = state.obj;
  const i = 3 + x;
  if (o.anim[i] === 0) return 0;                  // $C3B2 BEQ $C40E
  const y = u8(o.y[i] + (x >= 6 ? 4 : 0));        // $C3B4-$C3BD
  const px = o.animFrame[i] === 1                 // $C3BF CMP #$01
    ? u8(o.x[i] + 0x0B)                           // $C3C6/$C3C9 ADC #$0A + carry
    : o.x[i];                                     // $C3CE
  return probeCollision(state, px, y);            // $C3D3
}

/**
 * `$C2FF-$C32E` -- the ten enemy bullets against the terrain.
 *
 *   C2FF  A2 09 / 86 A8
 *   C303  A6 A8 / BD 36 01  LDA $0136,X / F0 20 BEQ $C32A
 *   C30A  BD 36 03  LDA $0336,X / BC 16 03 LDY $0316,X / D0 03 BNE $C315
 *   C312  18 / 69 08        a type-0 bullet probes 8 px BELOW its own Y
 *   C315  85 A5 / BD 76 03 LDA $0376,X / 85 A4
 *   C31C  20 D3 C3  JSR $C3D3      <-- $C3D3 DIRECTLY, not $C3A3's player front
 *   C31F  F0 09     BEQ $C32A
 *   C321  A9 0A / 18 / 65 A8 / AA / 20 F8 AE    the same $0A + slot free
 *   C32A  C6 A8 / 10 D5     DEC $A8 / BPL $C303
 *
 * PORTED IN WAVE 11. The `+ 8` is the only surprise and it is conditional on
 * the bullet KIND, not on anything about the map: type 0 (the only kind stage 1
 * fires) probes a point 8 px below the sprite's own Y, type 1 probes its Y.
 *
 * NOT REACHED BY ANY SCENARIO YET, and that is measured rather than assumed:
 * `$C30A` runs on every frame a bullet is alive (n = 1342 over one 700-frame
 * probe run) and `$C327` -- the free -- ran 0 times, because the only windows
 * in which a bullet exists are align-400 windows whose collision map is
 * 0/512. `enemy-bullet-ground` is the scenario that closes that: it aligns at
 * 1700 like `deep-ground`, where the cartridge's own map has 32 non-zero bytes.
 */
function bulletsVsTerrain(state, res) {
  const o = state.obj;
  let iters = 0;
  for (let x = 9; x >= 0; x--) {                  // $C2FF / $C32A / $C32C
    state.spawn.zA8 = x;                          // $C301 STX $A8
    iters += 1;
    const i = 22 + x;
    if (o.anim[i] === 0) continue;                // $C305 LDA $0136,X / BEQ $C32A
    let py = o.y[i];                              // $C30A LDA $0336,X
    if (o.type[i] === 0) py = u8(py + 8);         // $C30D BNE $C315 / $C312 ADC #$08
    // $C315 STA $A5 / $C317 LDA $0376,X / $C31A STA $A4 / $C31C JSR $C3D3
    if (probeCollision(state, o.x[i], py) !== 0) {  // $C31F BEQ $C32A
      freeSlot(state, u8(0x0A + x));              // $C321-$C327 JSR $AEF8
    }
  }
  state.spawn.zA8 = 0xFF;                         // $C32A's DEC failed the BPL
  if (iters !== ENEMY_SLOTS) {
    throw new Error(`$C2FF ran ${iters} slots, not ${ENEMY_SLOTS}`);
  }
}
