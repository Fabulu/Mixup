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
import { effects, startDeathBurst, deathBurstTick } from './effects.js';

// Joypad bits ($FFE1/$FFE2)
export const BTN = {
  A: 0x01, B: 0x02, SELECT: 0x04, START: 0x08,
  RIGHT: 0x10, LEFT: 0x20, UP: 0x40, DOWN: 0x80,
};

const AIR_GROUNDED = 0, AIR_RISING = 1, AIR_FALLING = 2;

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
    return;
  }

  applyCarry(state);

  // Death runs its own sequence and suppresses everything else.
  if (state.player.dead) { deathTick(state, manifest); return; }

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
  if (updateScriptedMove(state)) return;

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
  if (exit === 'reload') return;
  if (checkPitDeath(state)) return;     // $1755
  knockback(state);                     // $1776, before the input dispatch
  if (checkHpDeath(state)) return;      // $17B6

  // $17EA/$17FB: the cling freeze sits AFTER all four of those, not before.
  // Putting it first skipped knockback for the 16 frames of a wall freeze,
  // and since main.js decrements $C714 every frame regardless, a $5A stamp
  // could decay past the >= $59 window at $1782 and lose its launch entirely.
  if (clingLocked(state)) {
    // $17FB jumps to loc_00_1865, which runs both wall probes and nothing
    // else -- no input, no movement, no gravity.
    resolveWall(state, 'right');
    resolveWall(state, 'left');
    selectAnim(state);
    return;
  }

  horizontal(state);
  attack(state);                        // $18FB, between horizontal and vertical
  vertical(state);
  selectAnim(state);
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

/**
 * ROM: sub_00_29E7. Seeds the $C1C0 GAME OVER lettering from 0:$2AD7 -- eight
 * letters on one shared path, each trailing the last by 8 frames, which is
 * the snake. See the header of src/effects.js. Sets the
 * dying flag, the $78 counter and the jingle. It does NOT touch vx or vy --
 * MEASURED: a pit death mid-fall keeps vx = -2, vy = -66 frozen in the
 * trace for the whole sequence. Zeroing them here was a port invention and
 * diverged from f-death+1 on.
 *
 * The $78 is NOT the length of the sequence. Nothing decrements it until slot
 * 7 of the burst has finished its scripted flight, which takes 332 frames --
 * see deathBurstTick. MEASURED end to end on levels 1, 3 and 4: 452 frames
 * from here to loc_00_2AAD.
 */
function startDeath(state) {
  const p = state.player;
  if (p.dead) return;                   // $29EB: already dying
  // $29ED-$2A02: the 40-byte seed and $C712 = $78 in one go.
  startDeathBurst(state, state.tunables.deathSequenceFrames);
  p.dead = 1;                           // $29FD: $C715
  // state.deathTimer stays a MIRROR of $C712 -- main.js clears it on respawn
  // and the unit tests read it, but the burst is what owns the byte now.
  state.deathTimer = state.tunables.deathSequenceFrames;
  // $2A05 is LD BC,$0903 -- sub_00_0AE1 takes B as the id and C as the mask,
  // so this is song $09 with mask $03 (play + stop-all), not the $01 every
  // SFX site uses. It is music: the death jingle has to silence the level
  // theme, and mask $01 would leave both playing.
  requestSound(state, 0x09, 0x03);
}

/**
 * ROM: loc_00_2A0D ticks the GAME OVER lettering; loc_00_2AAD then decrements
 * lives and either restarts or ends the run.
 *
 * The burst is the sequence. $C712 -- what the port used to run down on its
 * own as `deathTimer` -- is not touched until slot 7 of the burst reaches the
 * end of its scripted path on frame 332, so the real length is 332 + 120 =
 * 452 frames, MEASURED identically on levels 1, 3 and 4. The old timer-only
 * version took 122.
 *
 * FAITHFUL CALL SITE: on the cartridge this runs from the MAIN LOOP, at $057A
 * on even frames and $05EC on odd -- once a frame either way, right after the
 * HUD draw and before the camera, and NOT gated on the pause. Running it here
 * instead only moves the burst's sprites later in OAM. See REPORT.
 */
function deathTick(state, manifest = null) {
  // Fire exactly once. Without this the timer sits at zero and every
  // subsequent frame takes another life, draining the lot in a fifth of a
  // second while the async reload is still in flight.
  if (state.flow.respawnPending) return;

  const landed = deathBurstTick(state, manifest);   // loc_00_2A0D
  state.deathTimer = effects(state).deathTicks;     // keep the mirror honest
  if (!landed) return;                              // $2A9E: not yet zero

  // $2AC6: BC = $2E03 -- id $2E, mask $03, on the way out to loc_00_035B.
  requestSound(state, 0x2E, 0x03);

  const flow = state.flow;
  flow.lives = (flow.lives - 1) & 0xFF;          // $2AB6
  if (flow.lives === 0 || flow.lives > 200) {    // wrapped past zero
    flow.lives = state.tunables.startingLives;   // game over -> fresh run
    flow.gameOver = (flow.gameOver || 0) + 1;
  }
  // main.js picks this up and re-runs initLevel, which is async.
  flow.respawnPending = true;
}

// ---------------------------------------------------------------------------
// Attacks.  ROM: loc_00_18FB (dispatch), loc_00_1990 (B button),
//           loc_00_19AD (punch), loc_00_19BE (throw), sub_00_201A (hit test).
// ---------------------------------------------------------------------------

/** ROM: loc_00_18FB */
function attack(state) {
  const p = state.player;

  if (p.springArmed) return;                    // $1902
  if (p.clingLock & 0x1F) return;               // $1909

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

/** ROM: sub_00_0AE1 - four-slot command ring at $C6FB (wired up in P5). */
function requestSound(state, id, mask = 0x01) {
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
  const dir = blocked ? -1 : (state.input.held & 0xF0);

  if (dir === BTN.RIGHT) {
    faceRight(state);
    // $1881: BIT 7 / JR NZ -> loc_00_1840. Pressing right while still moving
    // LEFT does not accelerate -- it bleeds speed off by 1 per frame until the
    // direction actually reverses. This applies in the air too.
    if (p.vx < 0) friction(state); else accelerate(state);
  } else if (dir === BTN.LEFT) {
    faceLeft(state);
    if (p.vx > 0) friction(state); else accelerate(state);   // $18C0
  } else if (p.air === AIR_GROUNDED) {
    // $183B -> $1840: grounded with no input decays toward zero.
    friction(state);
  }
  // $1859: airborne with no input keeps its velocity -- no air friction.

  move(state);
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
  p.vy = t.knockbackY;                             // $17B2: $18
}

/** ROM: loc_00_1840 - bleed 1 subpx/frame toward zero. */
function friction(state) {
  const p = state.player;
  if (p.vx !== 0) p.vx = i8(u8(p.vx + (p.vx < 0 ? 1 : -1)));
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
 * ROM: loc_00_1888 (right) / loc_00_18C8 (left) / loc_00_1865 (stationary).
 *
 * Both probes run every frame, in an order that depends on the direction of
 * travel: the LEADING probe decides whether to stop, and the trailing one runs
 * only if the leading one did not block. When standing still, both run
 * unconditionally. The trailing probe still applies its 1 px push, which is
 * how the game keeps the player nudged clear of walls.
 */
function move(state) {
  const p = state.player;

  if (p.vx === 0) {
    resolveWall(state, 'right');        // $1865: both, unconditionally
    resolveWall(state, 'left');
    return;
  }

  p.x = (p.x + p.vx) & 0xFFFF;          // sub_00_18E7

  const lead = p.vx > 0 ? 'right' : 'left';
  const trail = p.vx > 0 ? 'left' : 'right';

  // $189A / $18DE: on contact, zero the velocity. The original does not back
  // the move out -- the probe sits 8-9 px ahead while top speed is 1.5 px per
  // frame, so contact is seen long before anything overlaps.
  if (resolveWall(state, lead)) {
    p.vx = 0;                           // $18A3
  } else {
    resolveWall(state, trail);          // $189D / $18E1
  }
}

// ---------------------------------------------------------------------------
// Vertical.  ROM: $1A43 jump, $1A63 rising, $1A9D ceiling, $1ABB falling,
//            $1B1B floor.
// ---------------------------------------------------------------------------

function vertical(state) {
  const p = state.player;
  const t = state.tunables;

  // A cling established during THIS frame's horizontal pass already froze the
  // player; no gravity or integration runs on the cling frame either.
  if ((p.clingLock & 0x1F) !== 0) return;

  // --- jump start ($1A43) --------------------------------------------------
  if ((state.input.pressed & BTN.A) && p.air === AIR_GROUNDED && p.action === 0) {
    p.air = AIR_RISING;                     // $1A3B
    p.airThrottle = 1;                      // $1A3F: LD A,$01 -- ONE, not zero
    p.vy = p.springArmed ? t.springJumpVelocity : t.jumpVelocity;
    p.jumpReleased = 0;                     // $1A51
    p.springArmed = 0;                      // $1A54
  }

  // $1A57: a bat-rope action with bit 0 clear skips the rise integrate but
  // still falls through to the ceiling probe.
  const ropeSkip = p.action !== 0 && (p.action & 1) === 0;
  if (p.air === AIR_RISING && !ropeSkip) rising(state);   // $1A63

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

// ---------------------------------------------------------------------------
// Animation select.  ROM: loc_00_1B4A ($1B5D-$1D0B), a routine-for-routine
// translation.  Every arm below cites the address it came from, and the ONE
// rule that matters here is the project's usual one: follow where a label
// falls THROUGH, not where it is named.
//
// Three exits, and they are not interchangeable:
//   loc_00_1D08  `LDH A,[$FF88] / LDH [$FF8B],A` -- msIndex = facing, then draw
//   loc_00_1D0C  the draw ALONE; msIndex keeps whatever the arm left in it
//   (a `RET` from $1D1B, the invulnerability blink, which skips the draw AND
//    the $1D2C hitbox reload -- that half lives in render/metasprite.js)
//
// What this file must NOT do is touch $FFC4/$FFC5 (animFrame/animPrev): those
// belong to the TILE STREAMER, sub_00_2C13 at $05C9, which runs after the
// player update. selectAnim only ever READS $FFC4, as a "a repaint is still in
// flight, do not change pose" gate ($1C43, $1C50, $1CB3, $1CF6). The two
// routines are a feedback loop and modelling either one alone gets both wrong.
// ---------------------------------------------------------------------------

/**
 * Animation ids. Confirmed against the cartridge frame by frame, not guessed.
 * These are load-bearing: the hitbox is looked up per animation from 0:$27A8,
 * so the airborne poses are 1 px narrower (halfW 14) than the grounded ones
 * (halfW 15) and the crouch/low-throw poses are 4.
 *
 * The walk cycle is SIX frames, not four: $1CFE wraps on `CP $06`.
 */
export const ANIM = {
  WALK_CYCLE: [0x00, 0x01, 0x02, 0x03, 0x04, 0x05],   // $1CFB-$1D03
  WALK_WRAP: 0x06,                         // $1CFE: CP $06
  IDLE: 0x06,                              // $1CC7
  LAND: 0x07,                              // $1CD0, the $FF90 squat
  RISING: 0x08,                            // $1C49
  FALL_START: 0x09,                        // $1C5C, while vy >= $E6 unsigned
  FALL: 0x0A,                              // $1C63
  CROUCH: 0x0D,                            // $1C8E
  CLING_A: 0x11, CLING_B: 0x12,            // $1B9B / $1B9F
  TURN: [0x14, 0x13],                      // the $1BD3 skid pair, in ROM order
  ROPE: [0x1B, 0x1C, 0x1D],                // $1B84 / $1B88 / $1B80
  DEAD: 0x1E,                              // $1B63
};

/**
 * Attack poses. ROM tables at 0:$1C1F (grounded), 0:$1C27 (grounded + Down)
 * and 0:$1C2F (airborne), each indexed by `(attackTimer & $0C) >> 2` and
 * offset by `$C71D * 4` -- so a swing shows four poses over its 16 ticks and
 * the batarang throw is the same table four bytes along.
 *
 * $1C27 is not a separate table: it is 0:$1C1F + 8. Kept split for legibility.
 */

/**
 * Metasprite indices for the attack poses, ROM tables 0:$2786 and 0:$2796,
 * indexed by `facing * 4 + (pose ? 8 : 0) + quarter` ($1C16: `LD A,C /
 * ADD A,B / RST $28`).
 *
 * This is why the old "punch uses entry facing+2" heuristic worked at all:
 * entries 0/1 are the ordinary six-sprite Batman and have nowhere to put an
 * outstretched fist, so the extended frames switch to 2/3 (or 4/5 for the
 * crouching set, which the heuristic had no notion of).
 */

/**
 * ROM: the tail of loc_00_1B4A, from $1B5D (the screen-position cache at
 * $1B4A-$1B5C is cachePlayerScreen in render/metasprite.js).
 */
function selectAnim(state) {
  const p = state.player;

  // $FF91/$FF92 are read-modify-write HRAM bytes used by NOTHING outside this
  // routine (grepped: $1C94/$1C99 and $1C70/$1C7A/$1C8C are their only sites).
  // The ROM does not clear either at level init -- $04DD-$0500 lists $FFC3,
  // $FFC4, $FFC5 and a dozen others but not these -- so carrying them across a
  // level load is the faithful behaviour, not an oversight.
  if (p.prevVx === undefined) p.prevVx = 0;      // $FF91
  if (p.crouching === undefined) p.crouching = 0; // $FF92

  // $1B5D: dying overrides everything.
  if (p.dead) { p.anim = ANIM.DEAD; p.msIndex = p.facing; return; }

  // $1B6A: bat-rope FLIGHT poses. The test is `CP $03 / JR Z` then
  // `CP $02 / JR C` -- so action 3 and actions 0/1 fall to the cling check and
  // only action 2 (and any value above 3) reaches the $C71F phase ladder.
  if (p.action !== 3 && p.action >= 2) {
    const ph = p.ropeLength & 0xFF;              // $C71F
    p.anim = ph < 0x14 ? ANIM.ROPE[0]            // $1B84
           : ph < 0x1E ? ANIM.ROPE[1]            // $1B88
           : ANIM.ROPE[2];                       // $1B80
    p.msIndex = p.facing;                        // $1D08
    return;
  }

  // $1B8F: the wall cling. The switch point is $06, read straight off
  // `CP $06 / JR C` -- not empirical, and not 5.
  const cling = p.clingLock & 0x1F;
  if (cling !== 0) {
    p.anim = cling >= 0x06 ? ANIM.CLING_A : ANIM.CLING_B;
    p.msIndex = p.facing ^ 1;                    // $1BA3: XOR $01 -- this arm
    return;                                      // $1BA9: JP $1D0C, skipping $1D08
  }

  // $1BAC: the turn-around skid. The countdown is decremented HERE, in the
  // draw path, not by the movement code that arms it.
  if (p.turnTimer !== 0) {
    p.turnTimer = (p.turnTimer - 1) & 0xFF;
    // $1BB7: `AND $08 / ADD A,A / SWAP A` turns bit 3 into a 0/1 table index.
    // Bit 3 SET selects $1BD3+1 = $13. The old port had this inverted.
    p.anim = ANIM.TURN[(p.turnTimer & 0x08) ? 1 : 0];
    p.animTimer = 5;                             // $1BC6: $FF89 = 5
    p.msIndex = p.facing ^ 1;                    // $1BCA
    return;                                      // $1BD0: JP $1D0C
  }

  // $1BD5: an attack in progress owns the pose. `quarter` is the swing's
  // 16-tick counter divided into four, and the AIR test wins over Down.
  if (p.attackTimer !== 0) {
    const quarter = (p.attackTimer & 0x0C) >> 2;       // $1BE2
    const crouch = p.air === AIR_GROUNDED && (state.input.held & BTN.DOWN) !== 0;
    const set = p.air !== AIR_GROUNDED ? 'air' : (crouch ? 'crouch' : 'ground');
    const pose = p.attackPose & 0xFF;                  // $C71D
    // $1C04: a nonzero pose steps the anim table by 4 and the msIndex table
    // by 8 -- two different strides for the same selector.
    // Both tables are ONE contiguous block in the ROM: 0:$1C1F is 24 bytes
    // (ground, crouch, air) and 0:$2786 is 32 (ground, crouch), so the "set"
    // is just an offset. They throw when absent -- animation id 0 and
    // metasprite index 0 are both valid, so a default draws the wrong Batman
    // rather than failing.
    const anims = state.tables?.attackAnim;
    const msIdx = state.tables?.attackMsIndex;
    if (!anims || !msIdx) {
      throw new Error('player: tables.attackAnim/attackMsIndex missing');
    }
    const animBase = set === 'air' ? 16 : (set === 'crouch' ? 8 : 0);
    p.anim = anims[animBase + ((pose * 4 + quarter) & 0x07)];
    p.msIndex = msIdx[(crouch ? 16 : 0)
      + ((p.facing * 4 + (pose !== 0 ? 8 : 0) + quarter) & 0x0F)];
    return;                                            // $1C1C: JP $1D0C
  }

  // --- loc_00_1C37: no attack. Dispatch on $FF80. ---------------------------
  if (p.air === AIR_RISING) {                    // $1C43
    // $1C45: a repaint still in flight pins the pose. This gate is why the
    // old tick-counter version could never line up: the cadence is owned by
    // the tile streamer, not by a countdown in the state machine.
    if (p.animFrame === 0) p.anim = ANIM.RISING;
    p.msIndex = p.facing;                        // $1D08
    return;
  }

  if (p.air === AIR_FALLING) {                   // $1C50
    if (p.animFrame === 0) {
      // $1C58: `CP $E6 / JR C`. Falling velocities have wrapped into the high
      // byte range, so "unsigned >= $E6" is "not yet faster than -26" -- the
      // fall-entry pose is a SPEED band, never a frame count.
      p.anim = u8(p.vy) >= 0xE6 ? ANIM.FALL_START : ANIM.FALL;
    }
    p.msIndex = p.facing;
    return;
  }

  // --- loc_00_1C6A: grounded ------------------------------------------------
  if (state.input.held & BTN.DOWN) {             // $1C6C: BIT 7
    // $1C7E. Both of these leave $FF92 alone, so releasing Down out of an
    // armed spring or a $C750 freeze does NOT stamp the stand-up squat below.
    if (p.springArmed) {                         // $1C82 -> $1CC3
      p.anim = ANIM.CLING_A; p.msIndex = p.facing; return;
    }
    if (state.flow.bossMode) {                   // $1C88 -> $1CC7 ($C750)
      p.anim = ANIM.IDLE; p.msIndex = p.facing; return;
    }
    p.crouching = 1;                             // $1C8C: $FF92 = 1
    p.anim = ANIM.CROUCH;                        // $1C8E
    p.msIndex = p.facing;
    return;
  }

  // $1C70: Down was held last frame and is not now -> stand back up through
  // the same 8-frame squat a landing uses.
  if (p.crouching !== 0) {
    p.squatTimer = 0x08;                         // $1C75: $FF90 = 8
    p.crouching = 0;                             // $1C79
  }

  // $1C94: $FF91 is last frame's velocity, and it is stored unconditionally
  // BEFORE the branch -- so it tracks the walk arm as well as the idle one.
  const prevVx = p.prevVx & 0xFF;
  p.prevVx = u8(p.vx);
  if (u8(p.vx) !== 0) { walkAnim(state); return; }   // $1C9C -> $1CD6

  // Standing still. $1C9F-$1CAE: arriving at zero from a nonzero velocity,
  // on the ground, with no spring armed, stamps the squat -- this is the
  // little dip Batman does when he stops walking.
  if (prevVx !== 0 && p.air === AIR_GROUNDED && !p.springArmed) {
    p.squatTimer = 0x08;                         // $1CAC
  }

  p.animTimer = 0;                               // $1CB0: $FF89 = 0
  // $1CB6: `JR NZ, loc_00_1D0C` -- note the target. A repaint in flight leaves
  // BOTH the pose and $FF8B alone; it does not fall through to $1D08, so
  // msIndex keeps its previous value across these frames.
  if (p.animFrame !== 0) return;

  if (p.squatTimer !== 0) {                      // $1CB8 -> $1CCD
    p.squatTimer = (p.squatTimer - 1) & 0xFF;
    p.anim = ANIM.LAND;
    p.msIndex = p.facing;
    return;
  }
  // $1CBD: an armed spring holds the cling pose while standing.
  p.anim = p.springArmed ? ANIM.CLING_A : ANIM.IDLE;
  p.msIndex = p.facing;
}

/**
 * ROM: loc_00_1CD6 - the walk cycle.
 *
 * The frame time is a SPEED band, not a constant: 13 frames per step below
 * |vx| 9, 7 below $20, 5 above. Note the band is re-read every frame, so
 * accelerating out of a walk shortens the step already in progress rather
 * than only the next one.
 */
function walkAnim(state) {
  const p = state.player;

  const v = u8(p.vx);
  const speed = (v & 0x80) ? u8(-v) : v;         // $1CD8: CPL / INC A
  const band = speed < 0x09 ? 0x0D                // $1CEA
             : speed < 0x20 ? 0x07                // $1CEE
             : 0x05;                              // $1CE6

  const t = u8(p.animTimer + 1);                 // $1CF2
  if (t < band) {                                // $1CF3: CP B / JR C
    p.animTimer = t;                             // $1D06
  } else {
    // $1CF6: the streamer still owes this pose two columns, so hold the frame
    // and reset the timer instead of advancing.
    if (p.animFrame === 0) {
      const next = u8(p.anim + 1);               // $1CFD
      p.anim = next < ANIM.WALK_WRAP ? next : 0; // $1CFE: CP $06 / XOR A
    }
    p.animTimer = 0;                             // $1D05 / $1D06
  }
  p.msIndex = p.facing;                          // falls through to $1D08
}
