// Batman's state machine.  ROM: bank 0 inline, ~$1600-$20B9.
//
// Translated routine-for-routine; each block cites the address it came from.
// All arithmetic keeps 8-bit wrap semantics because the original relies on
// UNSIGNED byte comparisons against wrapped values -- most importantly the
// terminal-velocity clamp at $1B00, where a falling velocity of -66 is the
// byte $BE and the clamp is `CP C / JR NC`.

import { u8, i8 } from './state.js';
import { probeFloor, probeCeiling, resolveWall, probe, MODE_PUNCH, COLL } from './collision.js';
import { findFreeSlot, throwBatarang } from './batarang.js';
import { meleeHitTest } from './enemies.js';
import { updateScriptedMove } from './scriptedmove.js';
import { startRope } from './rope.js';
import { armDoor } from './doors.js';
import { BTN } from './input.js';
// loc_00_1B4A, the pose ladder, lives in ./player/anim.js. It is a JP TARGET:
// this chain runs INTO it and nothing comes back out. See that file's header
// for why it was safe to cut when the $1438..$1B4A region above was not.
import { selectAnim } from './player/anim.js';
// sub_00_29E7. Called from the pit arm ($1773) and the HP arm ($17E7) below --
// both `JP`s, so the rest of the update never runs. Its partner deathTick is
// NOT in this chain at all: src/main.js drives it from $057A/$05EC.
import { startDeath } from './player/death.js';

// $FF80. Written by the physics below; READ by the pose ladder in
// ./player/anim.js ($1C43, $1C50), which is why these three are exported into
// a two-node cycle rather than duplicated. Every reference on both sides is
// inside a function body, so no load order can observe them uninitialised.
export const AIR_GROUNDED = 0, AIR_RISING = 1, AIR_FALLING = 2;

export function updatePlayer(state, manifest = null) {
  // $1438: while $C750 is nonzero -- set ONLY by $0DE0, guarded on level $0E --
  // the HELD-input byte is cleared and the whole player chain is skipped to the
  // $1B4A draw tail: no scripted move, no carry, no exits, no pit test, no
  // knockback, no physics. MEASURED: hooks on $1755 and $1B42 count ZERO hits
  // across the entire level-14 intro, and the reroute's $FF87 stamp survives
  // precisely because the landing arm never runs to zero it.
  //
  // It sits HERE, at the very top, because the ROM's chain is
  // $1438 -> $1444 -> $1626 -> $1640 -> $1643 -> $170A -> $173C: ahead of BOTH
  // the scripted-move block and the conveyor-carry apply. Running those first
  // would let a door script or a pending carry move the player on a frame the
  // cartridge freezes him. Unreachable today -- level 14's entrance has
  // neither -- but this file has now been bitten twice by exactly this kind of
  // ordering, so it is placed correctly rather than conveniently.
  //
  // NOT the boss-death sequence, whatever an earlier comment said: every write
  // to $C750 is $0DC5 (=0), $0DE0 (=1, level $0E only), 1:$77D2 (=2) and
  // 1:$7808 (=0). Boss death writes $C740.
  if (state.flow.bossMode) {
    state.input.held = 0;               // $143F: $FFE1 = 0
    selectAnim(state);                  // $1441 -> loc_00_1B4A
    return true;                        // $1B4A falls through to the draw
  }

  // The GAME OVER burst used to be DRIVEN from here, first thing, because
  // $1772 ends a dying player's update outright and a burst ticked from inside
  // the chain would never reach loc_00_2AAD. That call site is now gone: on the
  // cartridge sub_00_29E7 is a MAIN-LOOP call ($057A on even frames, $05EC on
  // odd), immediately after the HUD arm and under the SAME $C740 test, so it
  // lives in src/main.js beside the two drawHud calls. deathTick is exported
  // for those two call sites and is not part of the player chain.

  // $1643: a scripted door/exit walk-through replaces the entire player
  // update while it runs -- no input, no physics, no collision.
  //
  // And no ANIMATION either: every arm of loc_00_164A ends at `LD [$C739],A /
  // RET` ($1702) or `LD [$C73A],A / RET` ($1706). Neither reaches $1B4A, so
  // the pose, $FF89, $FF90 and $FF8B all hold across the whole walk-through --
  // including the final frame, the one that writes VelX = $40 and drops the
  // player back to grounded at $16F0-$16FA.
  //
  // The port used to call selectAnim here, which was the fall-through trap in
  // its usual shape: the arm looked like "skip the update", so it borrowed the
  // update's tail. MEASURED on l5-walkerjump-approach f119, the frame a script
  // ends: the cartridge holds anim $0A / $FF89 = 4 / $FF90 = $0A while the port
  // stepped the walk cycle, and every walk frame after that ran one ahead.
  //
  // $1643 is `LD A,[$C737] / AND A / JP Z, loc_00_170A`, so the carry apply is
  // the ELSE of this branch, not something that runs before it: while a script
  // is running the $C72F/$C730 inbox is neither consumed, mirrored into
  // $C723/$C724, nor zeroed. A displacement queued on the frame a script arms
  // therefore stays pending for the whole walk-through and lands on the first
  // frame after it ends. The port used to apply it unconditionally, ahead of
  // this test.
  // $1643: `LD A,[$C737] / AND A / JP Z, loc_00_170A`. While a script runs the
  // ROM takes the $164A arm instead, and EVERY path out of it ends at $1702 or
  // $1706 with a bare RET -- so loc_00_1D0C is never reached and Batman is NOT
  // DRAWN for the whole walk-through. MEASURED on level 5 (hooks on $170A /
  // $1B4A / $1D0C, script "20:,180:R"): $1D0C fires every frame to f73, then
  // not once from f74 to f118 while $C737 = 1, then resumes at f120. The
  // cartridge's OAM over that span holds the 5 HUD sprites and nothing else.
  if (updateScriptedMove(state)) return false;
  applyCarry(state);                    // $1647 -> loc_00_170A

  // $173C-$1773: the exit tests and the PIT death test run at the TOP of the
  // player update, on the position the PREVIOUS frame left behind -- before
  // knockback, input and movement. Testing after vertical() instead reached
  // the death row one frame before the cartridge (MEASURED: level-3 pit,
  // port hp hit 0 at f117 where the cartridge waits for f118's update).
  // On the frame the pit test fires, $1773 is a JP, not a CALL: the rest of
  // the update -- movement, anim select, all of it -- never runs.
  //
  // The $FE exit is NOT like that. $286A is `JP loc_00_1776`: after the
  // teleport it re-enters this very chain at knockback and the whole rest of
  // the frame still runs. Returning out of the update there froze X for a
  // frame -- and $FE is the TOP exit on 12 of the 14 levels (table 0:$286D),
  // so it is the ordinary "walk off the top, fall back in" path, not an edge.
  const exit = checkExit(state);        // $173C / $174A
  if (exit === 'reload') return false;
  if (checkPitDeath(state)) return false;   // $1755 -> $1773 JP sub_00_29E7
  knockback(state);                     // $1776, before the input dispatch
  if (checkHpDeath(state)) return false;    // $17B6

  // $17EA/$17FB: the cling freeze sits AFTER all four of those, not before.
  // Putting it first skipped knockback for the 16 frames of a wall freeze,
  // and since main.js decrements $C714 every frame regardless, a $5A stamp
  // could decay past the >= $59 window at $1782 and lose its launch entirely.
  if (clingLocked(state)) {
    // $17FB jumps to loc_00_1865 -- and $1865 is NOT a dead end. It runs the
    // two wall probes and then `JP loc_00_18FB`, where $1909 sees the lock and
    // jumps to $1A9D: the ceiling probe, then $1AC2 into $1B1B, the floor
    // probe. A lock skips the MOVEMENT arms and the attack block; it does not
    // skip the probes. MEASURED with playerhunt cling over the 16 lock frames
    // of walljump-launch-off-right-wall: ceilProbes 1 and floorProbes 1 on
    // every one of them. (Nothing observable changes on those 16 frames --
    // the floor is far away and $1B38 ignores a catch while rising -- but the
    // port's version made falling()'s own $1AC2 arm dead code, which is the
    // kind of gap that only shows up somewhere else entirely.)
    resolveWall(state, 'right');        // $1865
    resolveWall(state, 'left');         // $1868
    verticalProbes(state);              // $1909 -> $1A9D, NOT $1A57: the rise
                                        // integrate is one of the arms a lock
                                        // does skip, which is what freezes y.
    selectAnim(state);
    return true;
  }

  horizontal(state);
  attack(state);                        // $18FB, between horizontal and vertical
  vertical(state);
  selectAnim(state);
  return true;
}

// ---------------------------------------------------------------------------
// Death.  ROM: loc_00_1755 (the pit test), sub_00_29E7 (the sequence),
//         loc_00_2AAD (lives and respawn).
// ---------------------------------------------------------------------------

/**
 * ROM: loc_00_1740 -> loc_00_2820. Walking off an edge changes level.
 *
 * Two edges only: past the camera clamp on the right, or above row $11 at the
 * top. The destination comes from the 14 x 2 table at 0:$286D, and two values
 * are special -- $FE means "no exit this way", which drops you back in from
 * the top of the SAME level rather than doing nothing, and $FF (boss levels)
 * has no walk-off exit at all; those end through the clear sequencer.
 *
 * @returns true if the player update should stop here this frame
 */
function checkExit(state) {
  const p = state.player;
  const lvl = state.level;

  let dest;
  if ((p.x >> 8) >= state.camera.clampRight) {        // $1740: CP B
    dest = lvl.exitRight;
  } else if ((p.y >> 8) < 0x11) {                     // $174C: CP $11
    dest = lvl.exitTop;
  } else {
    return false;
  }

  if (dest === undefined || dest === 0xFF) return false;   // no exit that way

  if (dest === 0xFE) {                                // $285B: teleport-fall
    p.y = 0x1100;                                     // $285D/$2860
    p.vy = 0;                                         // $2862
    p.airThrottle = 0;                                // $2864
    p.air = AIR_FALLING;                              // $2866
    // $286A: JP loc_00_1776 -- the update CONTINUES from knockback.
    return 'teleport';
  }

  // main.js performs the reload; initLevel is async.
  state.flow.nextLevel = dest;                        // $2834: $FFB0
  return 'reload';
}

/**
 * ROM: loc_00_1755 - fall past the death row.
 *
 * @returns true when the rest of the player update must be skipped -- BOTH
 * arms end it: $1772 RET when already dying, $1773 JP into the sequence.
 */
function checkPitDeath(state) {
  const p = state.player;

  // $1756: level $0B's floor is higher than everywhere else, so it dies at
  // row $1B instead of $21.
  const row = state.level.number === 0x0B ? 0x1B : state.tunables.deathPitRow;
  if ((p.y >> 8) < row) return false;

  p.action = 0;                         // $1769
  p.hp = 0;                             // $176C
  if (p.dead) return true;              // $1772: already dying, still ends here
  startDeath(state);                    // $1773
  return true;
}

/**
 * ROM: loc_00_17B6-$17E7 - the hp == 0 death, tested AFTER the knockback
 * block, with a gate the pit test does not have: an AIRBORNE player does not
 * die of empty hp unless he is in rope flight ($C71E == 2). The fatal hit's
 * own knockback sets air = 1 ($179A), so the launch plays out and the death
 * starts from the landing. (Level 14 gates on enemy slot 0 +1 bit 7 instead,
 * $17BD -- boss states are unported, not modelled.)
 *
 * @returns true when the death starts here, which ends the update ($17E7 is
 * a JP). An ALREADY dying player falls through and keeps updating -- unlike
 * the pit arm.
 */
function checkHpDeath(state) {
  const p = state.player;
  // $17B6: level 14 alone can bypass the airborne gate -- if the Joker's own
  // record ($C269, slot 0's +1) has bit 7 set, a 0-HP player dies in mid-air
  // instead of surviving until he lands. Everywhere else $17C4 applies, and
  // that gate is why taking lethal damage in water does not kill you: you stay
  // airborne, and the death fires the frame after you touch down. MEASURED on
  // the cartridge -- HP zeroed at air = 1, dying flag still 0 twenty-nine
  // frames later, set on the frame after landing.
  const jokerOverride = state.level.bossId === 4
    && (state.enemies[0][1] & 0x80) !== 0;
  if (!jokerOverride && p.air !== 0 && p.action !== 2) return false;  // $17C4-$17CE
  if (p.hp !== 0) return false;         // $17D0
  if (p.dead) return false;             // $17D5
  p.springArmed = 0;                    // $17DC: $C751
  p.action = 0;                         // $17DF
  // $17E2: $C717 = $FF (a sequencer latch) -- not modelled.
  startDeath(state);                    // $17E7
  return true;
}


// ---------------------------------------------------------------------------
// Attacks.  ROM: loc_00_18FB (dispatch), loc_00_1990 (B button),
//           loc_00_19AD (punch), loc_00_19BE (throw), sub_00_201A (hit test).
// ---------------------------------------------------------------------------

/** ROM: loc_00_18FB */
function attack(state) {
  const p = state.player;

  if (p.dead) return;                           // $18FF: JP NZ, loc_00_1A57
  if (p.springArmed) return;                    // $1902 -> loc_00_1A29
  if (p.clingLock & 0x1F) return;               // $1909 -> loc_00_1A9D

  // $1910: an attack already in flight advances its counter. The counter runs
  // 1..15 and wraps to 0; the hit test fires on exactly frame 8, and frames
  // 1-7 lock out any new action.
  if (p.attackTimer !== 0) {
    let a = p.attackTimer + 1;
    if (a >= 0x10) a = 0;                       // $1916: CP $10
    p.attackTimer = a;
    if (a === 8) { punchHitTest(state); return; }   // $1924
    if (a !== 0 && a < 9) return;               // $191D/$1921: still swinging
    // a == 0 or a >= 9: the swing is over, fall through and allow a new one.
  }

  if (p.action !== 0) return;                   // $192F: bat-rope in progress

  if (state.input.pressed & BTN.B) {            // $1936: BIT 1
    pressAttack(state);
    return;
  }
  if (state.input.pressed & BTN.UP) startRope(state);   // $193D: BIT 6
}

/**
 * ROM: loc_00_1990.
 *
 * Quirk reproduced deliberately: the ammo counter is decremented BEFORE the
 * free-slot search, so pressing B with all three batarangs already in flight
 * spends a batarang AND punches instead. Do not "fix" this.
 */
function pressAttack(state) {
  const p = state.player;
  let slot = -1;

  if (state.flow.ammo !== 0) {                  // $1990
    state.flow.ammo = (state.flow.ammo - 1) & 0xFF;   // $1996
    slot = findFreeSlot(state.batarangs);       // $199A-$19AB
  }

  if (slot < 0) {                               // $19AD: no ammo, or pool full
    requestSound(state, 0x10);
    p.attackTimer = 1;                          // $19B3
    p.attackPose = 0;                           // $19B7: 0 = punch
    return;
  }

  throwBatarang(state, slot);
  requestSound(state, 0x10);                    // $1A15
  if (p.attackTimer === 0) {                    // $1A1B: don't restart the anim
    p.attackTimer = 1;                          // $1A20
    p.attackPose = 1;                           // $1A24: 1 = batarang
  }
}

/**
 * ROM: sub_00_201A. Probe mode 5, fired on attack frame 8.
 *
 * Reaches 14 px ahead and 5 px up (or down if Down is held). The probe
 * settles in this order, and the order is load-bearing:
 *
 *   1. $20C9: probe row >= $20 -> nothing at all, not even the enemy scan.
 *   2. $20EC-$20FD: a non-empty map cell answers for the whole probe --
 *      EXCEPT water ($08), which the punch treats as empty ($20F8). So a
 *      punch "into a wall" can never hit an enemy standing inside it.
 *   3. Empty (or water): loc_00_2423 -> $2426 -> the SCREEN-SPACE enemy scan
 *      at $2643 (meleeHitTest). That scan is what makes enemies punchable.
 *
 * Of the map cells, only ones whose low 5 bits are $1F -- doors and
 * actor-owned destructibles -- respond; a punch does not break terrain.
 *
 * $20A7 tail, MEASURED with the level-3 punch scenario: a punch that
 * connects (enemy, or arming a door break) recoils the player, vx = -4 away
 * from facing -- unless a bat-rope action is running ($C71E).
 */
function punchHitTest(state) {
  const p = state.player;
  const dx = p.facing === 0 ? 0x00E0 : -0x00E0;         // $2024 / $2029
  const dy = (state.input.held & BTN.DOWN) ? 0x0050 : -0x0050;   // $202C

  const hit = probe(state, dx, dy, MODE_PUNCH);
  let value = hit.value;
  if ((hit.py >> 8) < 0x20 && (value === 0 || value === COLL.WATER)) {
    value = meleeHitTest(state, hit.px, hit.py);        // $2423 -> $2643
  }

  if (value !== 0xFF) {                                 // $203D
    if ((value & 0x1F) !== 0x1F) return;                // $2041: doors only
    // $2046-$20A4. This used to latch the PROBE cell straight into $C733/4/5,
    // which is wrong twice over: the sequencer wants the block's BOTTOM-LEFT
    // cell, and which cell that is depends on the GRAPHIC id (all four of a
    // door's cells carry the identical collision byte, so the collision cannot
    // tell you). It also skipped the debris spawn entirely. Both live in
    // armDoor, which returns false on the busy refusal at $2046 -- and note
    // that refusal skips the recoil below too, because $2046's RET NZ leaves
    // before the fall-through into $20A7.
    if (!armDoor(state, hit.col, hit.row)) return;
  }

  // $20A7: punch recoil. Skipped mid-rope; NOT skipped by anything else.
  if (p.action !== 0) return;                           // $C71E
  p.vx = p.facing === 0 ? -4 : 4;                       // $20B1 ($FC) / $20B5
}

/**
 * Cling-lock countdown.  ROM: loc_00_17EA.
 *
 * $FFB2 packs a countdown in bits 0-4 and the d-pad direction the wall jump
 * launched you in bits 5-7. While the countdown runs the whole player update
 * is skipped. The direction bits SURVIVE the countdown and then gate input:
 * until they are cleared, only that exact d-pad direction is accepted.
 *
 * @returns true if the player is frozen this frame
 */
function clingLocked(state) {
  const p = state.player;
  const timer = p.clingLock & 0x1F;
  if (timer === 0) return false;

  p.clingLock = (p.clingLock & 0xE0) | (timer - 1);   // $17F1-$17F7
  if ((p.clingLock & 0x1F) !== 0) return true;

  // $17FF: the jump sound fires when the lock expires, not when it starts.
  requestSound(state, 0x0F);
  return false;
}

/**
 * ROM: sub_00_0AE1 - four-slot command ring at $C6FB (wired up in P5).
 *
 * Exported for ./player/death.js only, which needs it for the $2A05 jingle and
 * the $2AC6 after-death theme. That is the back half of a deliberate two-node
 * cycle; see that file's header.
 */
export function requestSound(state, id, mask = 0x01) {
  if (state.sound && state.sound.queue.length < 4) {
    state.sound.queue.push({ id, mask });
  }
}

/**
 * ROM: loc_00_1806 - after a wall jump, input is ignored unless the held
 * d-pad exactly equals the locked direction.
 */
function inputBlockedByCling(state) {
  const p = state.player;
  const locked = p.clingLock & 0xE0;
  if (locked === 0) return false;
  return (state.input.held & 0xF0) !== (locked >> 1);   // $180B: SRL A
}

// ---------------------------------------------------------------------------
// Horizontal.  ROM: $1820 dispatch -> $186E/$18A9 facing -> $1D3D accelerate
//              -> $1888/$18C8 move+collide, $1840 friction.
// ---------------------------------------------------------------------------

function horizontal(state) {
  const p = state.player;

  // $182D: `AND $F0 / CP $10` -- ONLY Right, with no other d-pad bit set.
  // Diagonals deliberately do not walk (Up is the bat-rope, Down the low throw).
  //
  // FOUR things suppress directional input entirely, all falling through to
  // the friction path at $183B:
  //   $1813  a wall jump's locked direction
  //   $1815  an attack in progress ($FF97) -- you cannot steer mid-swing
  //   $181A  a bat-rope action in progress ($C71E)
  //   $1820  $C751, the armed spring jump -- this one was missing, and it is
  //          what freezes the player through level 11's entrance cutscene
  const blocked = inputBlockedByCling(state)
    || p.attackTimer !== 0
    || p.action !== 0
    || p.springArmed !== 0;

  // $1826: `LD A,[$C715] / AND A / JP NZ, loc_00_1A57`. A dead player who has
  // not already been diverted to the friction path leaves the horizontal block
  // ENTIRELY -- no facing, no acceleration, no move(), and not even the pair of
  // wall probes at $1865. MEASURED (deadphys.py, level 3, warp 7,28, HP zeroed
  // at f10): from f11 on the cartridge runs the ceiling probe once and the
  // floor probe once per frame and the wall probe ZERO times, while the corpse
  // rides the conveyor at 4 subpixels a frame for the rest of the sequence.
  // Note the ORDER -- the four `blocked` tests are upstream of this one, so a
  // player who dies mid-swing still takes $183B and still gets his wall probes.
  if (!blocked && p.dead) return;

  const dir = blocked ? -1 : (state.input.held & 0xF0);

  if (dir === BTN.RIGHT) {                      // $1833 -> loc_00_186E
    faceRight(state);
    // $1881: BIT 7 / JR NZ -> loc_00_1840. Pressing right while still moving
    // LEFT does not accelerate -- it bleeds speed off by 1 per frame until the
    // direction actually reverses. This applies in the air too.
    if (p.vx < 0) { frictionPath(state); return; }
    accelerate(state);                          // $1885
    moveRight(state);                           // $186E falls INTO $1888
    return;
  }
  if (dir === BTN.LEFT) {                       // $1838 -> loc_00_18A9
    faceLeft(state);
    if (p.vx > 0) { frictionPath(state); return; }           // $18C2
    accelerate(state);                          // $18C5
    moveLeft(state);                            // $18A9 falls INTO $18C8
    return;
  }

  // $183B: no usable direction.
  if (p.air !== AIR_GROUNDED) { coast(state); return; }      // $1859
  frictionPath(state);                          // $1840
}

/**
 * ROM: loc_00_1780. Fires once, on the frame the invulnerability timer is
 * freshly stamped.
 *
 * $C714 is set to $5A or $DA -- the same 90-frame count, with bit 7 encoding
 * which way to be thrown. The `CP $59` gate means only a fresh stamp triggers
 * knockback; the bit is then stripped so the countdown that follows can never
 * re-trigger it.
 */
function knockback(state) {
  const p = state.player;
  const t = state.tunables;

  // $177C: the DECREMENT lives HERE, at the head of the player update, not at
  // the end of the frame. main.js used to do it after everything had run,
  // which left every mid-frame reader of $C714 one count high -- documented as
  // an artifact in docs/03-VERIFICATION.md section 29 and worked around rather
  // than fixed. It is fixed now, which is what lets applyAnimHitbox honour the
  // $1D1B blink gate: that gate tests bit 3 of this byte, so an off-by-one
  // picks the wrong eight frames out of every sixteen.
  if (p.iframes === 0) return;                     // $177A
  p.iframes = u8(p.iframes - 1);                   // $177C-$177D
  if (p.iframes === 0) return;                     // $1780
  if ((p.iframes & 0xFF) < 0x59) return;           // $1782: only a fresh stamp

  const dirBit = p.iframes & 0x80;                 // $178C
  p.iframes = p.iframes & 0x7F;                    // $1787: RES 7
  p.vx = dirBit ? -t.knockbackX : t.knockbackX;    // $1790 / $1794
  p.air = AIR_RISING;                              // $1798
  p.action = 0;                                    // $179C

  // $17A0-$17B0: level 4 has its own launch. If $C73F is set -- boss 1's crit
  // flag, written by $3CB6 and by the crit dash at $62BF, both of which are
  // already ported -- the vertical kick is $40 instead of $17B2's $18. The
  // port always took $17B2, which is a 40-unit error on EVERY knockback in the
  // boss-1 fight: enemyhunt l4-boss1-punch counts $17AC once and $17B2 never.
  // MEASURED (playerhunt kb4): level 4 + $C73F=1 -> vy 60 two frames later;
  // level 4 + $C73F=0 -> 20; level 5 + $C73F=1 -> 20.
  //
  // $17A2 reads $FFB0 (the LEVEL), not $C73E (the boss id) -- they agree on
  // level 4 but they are not the same byte, and only one of them is what the
  // ROM tests here. `knockbackCritY` is not a tunable yet; $40 is the literal
  // at $017AD and the `??` is there so wiring one up later just works.
  const crit = state.level.number === 4 && (state.flow.bossCrit || 0) !== 0;
  p.vy = crit ? (t.knockbackCritY ?? 0x40) : t.knockbackY;   // $17AC / $17B2
}

/**
 * ROM: loc_00_1840 - bleed 1 subpx/frame toward zero, then DISPATCH.
 *
 * The bleed is only half of this label. Where it goes afterwards is the other
 * half, and it is not "carry on to the move": a velocity that is zero, or that
 * reaches zero on this frame, jumps to $1865 (both probes, unconditionally),
 * while a surviving one jumps to $1888 or $18C8 by sign.
 */
function frictionPath(state) {
  const p = state.player;
  if (p.vx === 0) { bothWallProbes(state); return; }         // $1843
  if (p.vx < 0) {
    p.vx = i8(u8(p.vx + 1));                                 // $1851
    if (p.vx === 0) { bothWallProbes(state); return; }       // $1854
    moveLeft(state);                                         // $1856
    return;
  }
  p.vx = i8(u8(p.vx - 1));                                   // $184A
  if (p.vx === 0) { bothWallProbes(state); return; }         // $184D
  moveRight(state);                                          // $184F
}

/** ROM: loc_00_1859 - airborne with no input keeps its velocity, no friction. */
function coast(state) {
  const p = state.player;
  if (p.vx === 0) { bothWallProbes(state); return; }         // $185C
  if (p.vx < 0) moveLeft(state); else moveRight(state);      // $1860 / $1863
}

/** ROM: loc_00_1865 - both probes, in that order, neither conditional. */
function bothWallProbes(state) {
  resolveWall(state, 'right');          // $1865
  resolveWall(state, 'left');           // $1868
}

/** ROM: loc_00_186E */
function faceRight(state) {
  const p = state.player;
  // Turn stall is animation-only ($1BAC picks anims $14/$13); it does not
  // block movement.
  if (p.air === AIR_GROUNDED && p.facing !== 0) {
    p.turnTimer = state.tunables.turnAroundFrames;
  }
  p.facing = 0;
}

/** ROM: loc_00_18A9 */
function faceLeft(state) {
  const p = state.player;
  if (p.air === AIR_GROUNDED && p.facing === 0) {
    p.turnTimer = state.tunables.turnAroundFrames;
  }
  p.facing = 1;
}

/**
 * ROM: sub_00_1D3D. Accelerate in the facing direction.
 *
 * The three-way branch is the original's, and the thresholds ($1A / $E6) are
 * NOT the same as the speed caps ($18 / $E8): between cap and threshold the
 * speed snaps to the cap, but beyond the threshold -- which is how you arrive
 * off a conveyor or knockback -- it decays by 2 instead.
 */
function accelerate(state) {
  const p = state.player;
  const t = state.tunables;

  // $1D4D: in the air, accelerate only every other frame.
  if (p.air !== AIR_GROUNDED) {
    if (p.airThrottle !== 0) { p.airThrottle--; return; }
    p.airThrottle = 1;
  }

  if (p.facing === 0) {
    const max = u8(p.slowMode ? t.waterSpeedRight : t.walkSpeedMaxRight);
    const a = u8(p.vx + 1);
    if (a < max) p.vx = i8(a);              // $1D62 CP B / JR C
    else if (a < 0x1A) p.vx = i8(max);      // $1D65 CP $1A / JR C
    else p.vx = i8(u8(a - t.overspeedDecelStep));
  } else {
    const max = u8(p.slowMode ? t.waterSpeedLeft : t.walkSpeedMaxLeft);
    const a = u8(p.vx - 1);
    if (a >= max) p.vx = i8(a);             // $1D91 CP B / JR NC
    else if (a >= 0xE6) p.vx = i8(max);     // $1D94 CP $E6 / JR NC
    else p.vx = i8(u8(a + t.overspeedDecelStep));
  }
}

/**
 * ROM: loc_00_1888 (right) / loc_00_18C8 (left).
 *
 * The LEADING probe decides whether to stop, and the trailing one runs only if
 * the leading one did not block. The trailing probe still applies its 1 px
 * push, which is how the game keeps the player nudged clear of walls.
 *
 * The guard at the head of each is NOT a redundant sign check, and this is the
 * fall-through trap in its usual shape: $1888 and $18C8 are jumped INTO from
 * $186E/$18A9 as well as from $1840/$1859, so they receive a velocity that
 * accelerate() may have left at zero -- and they are not symmetric about it.
 * $188A tests `BIT 7` and skips only a NEGATIVE velocity, so a zero one still
 * moves by zero and still probes; $18CA tests `JP Z` and skips a zero one too,
 * so it runs NO probe at all. That asymmetry is observable: MEASURED on level
 * 12 (breakcells.py --warp 50,18 --hold left, hooks on $1FAF/$1F87), the
 * cartridge runs the left probe on f50, f52 and f54 and NOT on f51/f53/f55 --
 * exactly the frames the air throttle leaves VelX at 0 while LEFT is held. A
 * port that routed "vx == 0" to $1865 instead pushed the player out of the
 * wall one frame early, every other frame, for as long as he held the
 * direction.
 */
function moveRight(state) {
  const p = state.player;
  if (p.vx < 0) return;                 // $188A: BIT 7 / JP NZ loc_00_18FB
  p.x = (p.x + p.vx) & 0xFFFF;          // $1894: sub_00_18E7, B = 0

  // $189A: on contact, zero the velocity. The original does not back the move
  // out -- the probe sits 8-9 px ahead while top speed is 1.5 px per frame, so
  // contact is seen long before anything overlaps.
  if (resolveWall(state, 'right')) { p.vx = 0; return; }     // $189B -> $18A3
  resolveWall(state, 'left');           // $189D
}

function moveLeft(state) {
  const p = state.player;
  if (p.vx >= 0) return;                // $18CA / $18D2: JP Z loc_00_18FB
  p.x = (p.x + p.vx) & 0xFFFF;          // $18D8: sub_00_18E7, B = $FF
  if (resolveWall(state, 'left')) { p.vx = 0; return; }      // $18DF -> $18A3
  resolveWall(state, 'right');          // $18E1
}

// ---------------------------------------------------------------------------
// Vertical.  ROM: $1A43 jump, $1A63 rising, $1A9D ceiling, $1ABB falling,
//            $1B1B floor.
// ---------------------------------------------------------------------------

function vertical(state) {
  const p = state.player;

  // $1909 / $18FF: BOTH of the arms that skip the jump start land INSIDE the
  // vertical block, not past it. A cling set by this frame's own wall probe
  // goes to $1A9D (the ceiling probe) and a dead player to $1A57, so each
  // one skips the jump and the rise integrate -- and nothing else. The port
  // used to return from the top of this function on a cling, which silently
  // deleted the ceiling and floor probes for all 16 frames of the freeze;
  // MEASURED with playerhunt cling (walljump-launch-off-right-wall): the
  // cartridge runs both, once each, on every one of those frames.
  if (p.clingLock & 0x1F) { verticalProbes(state); return; }   // $1909 -> $1A9D
  if (!p.dead) jumpStart(state);                               // $1902/$1941
  verticalTail(state);                                         // $18FF -> $1A57
}

/**
 * ROM: loc_00_1A29-$1A54. Reached from $1902 (armed spring), $1926/$192C (an
 * attack in flight) and $1941 (B and Up both unpressed) -- i.e. from every
 * tail of the attack block that is not a rope start.
 */
function jumpStart(state) {
  const p = state.player;
  const t = state.tunables;

  if (!(state.input.pressed & BTN.A)) return;   // $1A2B: BIT 0 of $FFE2
  if (p.air !== AIR_GROUNDED) return;           // $1A30
  if (p.action !== 0) return;                   // upstream, $192F

  // $1A35: LD BC,$0F01 / CALL sub_00_0AE1 -- one instruction before the air
  // flag is set. This was simply MISSING from the port, so every jump in the
  // game was silent. It hid because the other two $0F sites are ported (the
  // wall-jump lock expiring at $17FF, and the rope's), so the cue itself was
  // never suspect. MEASURED: playerhunt sound on "40:,4:A,46:" queues exactly
  // one $0F/$01 on frame 40 and portsound.mjs queued nothing at all.
  requestSound(state, 0x0F, 0x01);

  p.air = AIR_RISING;                     // $1A3B
  p.airThrottle = 1;                      // $1A3F: LD A,$01 -- ONE, not zero
  p.vy = p.springArmed ? t.springJumpVelocity : t.jumpVelocity;
  p.jumpReleased = 0;                     // $1A51
  p.springArmed = 0;                      // $1A54
}

/** ROM: loc_00_1A57 to loc_00_1B4A -- the vertical chain minus the jump. */
function verticalTail(state) {
  const p = state.player;

  // $1A57: a bat-rope action with bit 0 clear skips the rise integrate but
  // still falls through to the ceiling probe.
  const ropeSkip = p.action !== 0 && (p.action & 1) === 0;
  if (p.air === AIR_RISING && !ropeSkip) rising(state);   // $1A63

  verticalProbes(state);
}

/**
 * ROM: loc_00_1A9D to loc_00_1B4A -- the ceiling probe, gravity and the floor
 * probe. A separate entry point because three arms jump straight HERE rather
 * than to $1A57: $1909 (cling lock), $1A61 (a rope with bit 0 clear) and
 * $1A67 (not rising).
 */
function verticalProbes(state) {
  // $1A9D is NOT rising-only: every path through the vertical block passes it
  // -- grounded and falling included. That is how the level-5 descending
  // spike trap pushes a falling player down a row, and how it hurts him once
  // he is standing and the spikes reach his head row.
  ceiling(state);

  // $1ABF's arm jumps past the floor check; every other exit from falling()
  // falls through to it.
  if (falling(state)) return;
  floor(state);
}

/** ROM: loc_00_1A63 - decelerate the rise; flip to falling when it goes past 0. */
function rising(state) {
  const p = state.player;
  const t = state.tunables;

  // $1A69: gravity is lighter while A is held (the variable-height jump), and
  // water also uses the light value.
  let g;
  if (state.input.held & BTN.A) {
    g = t.gravityRisingHeld;
  } else {
    p.jumpReleased = 1;                     // $1A6F -> $FFC2
    g = p.slowMode ? t.gravityRisingHeld : t.gravityRisingReleased;
  }

  // $1A7E: SUB B / JR NC. A borrow means the rise is over.
  const raw = u8(p.vy) - g;
  if (raw < 0) p.air = AIR_FALLING;         // $1A84
  p.vy = i8(u8(raw));

  // $1A8B: BC = -VelY sign extended, then Y += BC. Positive VelY moves up.
  p.y = (p.y - p.vy) & 0xFFFF;
}

/** ROM: loc_00_1A9D - head hits something: stop rising, snap down a row. */
function ceiling(state) {
  const p = state.player;
  const hit = probeCeiling(state);
  if (!hit) return;

  if (hit !== 0xFF) {
    // $1AA7: INC $FF83 / clear $FF84 -- push down to the next row boundary.
    p.y = ((p.y + 0x100) & 0xFF00);
  }
  p.air = AIR_FALLING;                      // $1AAF
  p.vy = 0;
  p.airThrottle = 0;
  p.action = 0;
}

/**
 * ROM: loc_00_1ABB - gravity while not rising, with the unsigned clamp.
 *
 * @returns true if the chain ended at loc_00_1B41 and the caller must NOT run
 *          the floor probe. Only the $1ABF arm does that.
 */
function falling(state) {
  const p = state.player;
  const t = state.tunables;

  // $1ABF is `JP NZ, loc_00_1B41` -- the LANDING tail, and it lands PAST the
  // floor check at $1B1B. That distinction is the whole bug: the other three
  // early exits below ($1AC2/$1AC8/$1AD4) all fall through to $1B1B and still
  // get their floor probe, but this one does not. Returning here and letting
  // vertical() run floor() anyway re-derives air from the ground the player is
  // NOT standing on, and puts him straight back to falling -- so `true` means
  // "the chain ended, skip the floor probe".
  //
  // Only reachable where $C751 is set, and the whole ROM sets it in exactly
  // one place ($2D0B), so the "spring jump" tunable is really "the jump that
  // ends level 11's entrance cutscene" -- which is what caught this.
  if (p.springArmed) {
    p.air = AIR_GROUNDED;                          // $1B42: $FF80 = 0
    p.vy = 0;                                      // $1B44: $FF87 = 0
    p.clingLock = 0;                               // $1B46: $FFB2 = 0
    p.jumpReleased = 0;                            // $1B48: $FFC2 = 0
    return true;
  }
  if (p.clingLock & 0x1F) return false;            // $1AC2
  if (p.action !== 0 && (p.action & 1) === 0) return false;  // $1AC8
  if (p.air === AIR_RISING) return false;          // $1AD4

  if (!(state.input.held & BTN.A)) p.jumpReleased = 1;   // $1AE0

  // $1AE4: in water gravity is applied only 1 frame in 8.
  let g;
  if (p.slowMode) {
    if ((state.frame & 0x07) !== 0) { integrateFall(state); return false; }
    g = t.waterGravity;
  } else {
    g = t.gravityFalling;
  }

  // $1AFA: terminal velocity as an UNSIGNED byte compare. Falling velocities
  // have wrapped into the high byte range ($FF, $FE ... $BE), so `A >= $BE`
  // is exactly "not yet at terminal". This is why the port keeps byte math.
  const terminal = u8(p.slowMode ? t.waterTerminal : t.terminalVelocity);
  const a = u8(u8(p.vy) - g);
  p.vy = i8(a >= terminal ? a : terminal);

  integrateFall(state);
  return false;
}

function integrateFall(state) {
  const p = state.player;
  p.y = (p.y - p.vy) & 0xFFFF;              // $1B18 via sub_00_18F1
}

/** ROM: loc_00_1B1B -> sub_00_1DB9. */
function floor(state) {
  const p = state.player;

  // The floor probe runs even while RISING. $1AD4 tests `air == 1` and jumps
  // straight to loc_00_1B1B (the floor check), skipping only gravity -- so a
  // slope surface can catch the player mid-ascent. Guarding on `vy > 0` here
  // looks obviously right and silently drops those catches.

  const r = probeFloor(state);

  // $1B34: a floor hit while RISING is ignored outright -- you pass up through
  // it. The probe's side effects still stand (a slope will have rewritten Y),
  // but air/vy are untouched, so Batman keeps climbing.
  if (r.landed && p.air === AIR_RISING) return;    // $1B38

  if (r.landed) {
    // ROM: loc_00_1B41. Landing clears the cling lock -- including the locked
    // direction bits, which is what re-enables normal steering after a wall
    // jump -- and the jump-released flag.
    //
    // It deliberately does NOT reset the air throttle: there is no write to
    // $FF98 anywhere in the landing path, so the odd/even acceleration phase
    // of the next fall inherits from this one.
    if (p.air !== AIR_GROUNDED) {
      p.squatTimer = state.tunables.landingSquatFrames;   // $1B3D
    }
    p.air = AIR_GROUNDED;       // $1B42
    p.vy = 0;                   // $1B44
    p.clingLock = 0;            // $1B46
    p.jumpReleased = 0;         // $1B48
  } else {
    // $1B21: no floor underneath -- start falling, unless a bat-rope is active
    // or we are already on the way up.
    if (p.action !== 0) return;                    // $1B25
    if (p.air === AIR_RISING) return;              // $1B2D
    p.air = AIR_FALLING;                           // $1B2F
  }
}

/**
 * ROM: loc_00_170A, the very first thing the player machine does.
 *
 * $C72F/$C730 are a displacement inbox: conveyors, moving platforms and the
 * bat-rope all write into it and the player picks it up on the NEXT frame,
 * because everything that writes it runs after this point in the loop. The pair
 * is zeroed here ($1738) whether or not it was used, so a carry only ever
 * applies once.
 *
 * The values are also copied to $C723/$C724 first, which the rope's draw pass
 * reads so a rope in flight tracks a Batman who is riding a platform.
 */
function applyCarry(state) {
  const c = state.carry;
  state.rope.saveX = c.x;                  // $170E
  state.rope.saveY = c.y;                  // $1724
  if (c.x) state.player.x = (state.player.x + c.x) & 0xFFFF;   // $171F
  if (c.y) state.player.y = (state.player.y + c.y) & 0xFFFF;   // $1735
  c.x = 0;                                 // $1738: cleared unconditionally
  c.y = 0;
}

