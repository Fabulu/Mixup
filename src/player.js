// Batman's state machine.  ROM: bank 0 inline, ~$1600-$20B9.
//
// Translated routine-for-routine; each block cites the address it came from.
// All arithmetic keeps 8-bit wrap semantics because the original relies on
// UNSIGNED byte comparisons against wrapped values -- most importantly the
// terminal-velocity clamp at $1B00, where a falling velocity of -66 is the
// byte $BE and the clamp is `CP C / JR NC`.

import { u8, i8 } from './state.js';
import { probeFloor, probeCeiling, resolveWall, probe } from './collision.js';
import { findFreeSlot, throwBatarang } from './batarang.js';
import { updateScriptedMove } from './scriptedmove.js';

// Joypad bits ($FFE1/$FFE2)
export const BTN = {
  A: 0x01, B: 0x02, SELECT: 0x04, START: 0x08,
  RIGHT: 0x10, LEFT: 0x20, UP: 0x40, DOWN: 0x80,
};

const AIR_GROUNDED = 0, AIR_RISING = 1, AIR_FALLING = 2;

export function updatePlayer(state) {
  // Death runs its own sequence and suppresses everything else.
  if (state.player.dead) { deathTick(state); return; }

  if (clingLocked(state)) {
    // ROM: $17FB jumps to loc_00_1865, which runs both wall probes and
    // nothing else -- no input, no movement, no gravity.
    resolveWall(state, 'right');
    resolveWall(state, 'left');
    selectAnim(state);
    return;
  }
  // $1643: a scripted door/exit walk-through replaces the entire player
  // update while it runs -- no input, no physics, no collision.
  if (updateScriptedMove(state)) { selectAnim(state); return; }

  knockback(state);                     // $1780, before the input dispatch
  horizontal(state);
  attack(state);                        // $18FB, between horizontal and vertical
  vertical(state);
  checkDeath(state);                    // $1755
  selectAnim(state);
  applyCarry(state);
}

// ---------------------------------------------------------------------------
// Death.  ROM: loc_00_1755 (the pit test), sub_00_29E7 (the sequence),
//         loc_00_2AAD (lives and respawn).
// ---------------------------------------------------------------------------

/** ROM: loc_00_1755 - fall past the death row, or run out of HP. */
function checkDeath(state) {
  const p = state.player;
  if (p.dead) return;

  // $1756: level $0B's floor is higher than everywhere else, so it dies at
  // row $1B instead of $21.
  const row = state.level.number === 0x0B ? 0x1B : state.tunables.deathPitRow;

  if ((p.y >> 8) >= row || p.hp === 0) {
    p.action = 0;                       // $1769
    p.hp = 0;                           // $176C
    startDeath(state);                  // $1773
  }
}

/** ROM: sub_00_29E7 */
function startDeath(state) {
  const p = state.player;
  if (p.dead) return;                   // $29EB: already dying
  p.dead = 1;                           // $29FD: $C715
  state.deathTimer = state.tunables.deathSequenceFrames;   // $2A00: $78
  p.vx = 0;
  p.vy = 0;
  requestSound(state, 0x09);            // $2A05: the death jingle
}

/**
 * ROM: loc_00_2A0D ticks the particle burst; loc_00_2AAD then decrements
 * lives and either restarts or ends the run.
 *
 * The original returns to the round-select screen here. Restarting the level
 * in place is the closer fit for a single-level build, and it is what stops a
 * fall off the map being a softlock.
 */
function deathTick(state) {
  // Fire exactly once. Without this the timer sits at zero and every
  // subsequent frame takes another life, draining the lot in a fifth of a
  // second while the async reload is still in flight.
  if (state.flow.respawnPending) return;
  if (state.deathTimer > 0) { state.deathTimer--; return; }

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

/** ROM: loc_00_1944 - Up starts the bat-rope. */
function startRope(state) {
  const p = state.player;
  requestSound(state, 0x10);
  p.action = 1;                                 // $194A: $C71E rope-fire
  p.attackPose = 1;                             // $194F
  p.attackTimer = 1;                            // $1952
  p.ropeLength = 0;                             // $1955: $C71F
  p.ropeSegments = state.tunables.ropeSegments; // $195D: $FFB4 = 5
}

/**
 * ROM: sub_00_201A. Probe mode 5, fired on attack frame 8.
 *
 * Reaches 14 px ahead and 5 px up (or down if Down is held). Only cells whose
 * low 5 bits are $1F -- doors and actor-owned destructibles -- respond; a
 * punch does not break ordinary terrain. Enemy damage is a separate test that
 * arrives with the enemy array.
 */
function punchHitTest(state) {
  const p = state.player;
  const dx = p.facing === 0 ? 0x00E0 : -0x00E0;         // $2024 / $2029
  const dy = (state.input.held & BTN.DOWN) ? 0x0050 : -0x0050;   // $202C

  const hit = probe(state, dx, dy);
  if (hit.value === 0xFF) return;                       // $203D
  if ((hit.value & 0x1F) !== 0x1F) return;              // $2041: doors only
  if (state.doors.active) return;                       // $2046: $C733 busy
  state.doors.active = 1;                               // $204D
  state.doors.col = hit.col;
  state.doors.row = hit.row;
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
  // Three things suppress directional input entirely, all falling through to
  // the friction path at $183B:
  //   $1813  a wall jump's locked direction
  //   $1815  an attack in progress ($FF97) -- you cannot steer mid-swing
  //   $181A  a bat-rope action in progress ($C71E)
  const blocked = inputBlockedByCling(state)
    || p.attackTimer !== 0
    || p.action !== 0;
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

  if (p.iframes === 0) return;                     // $177A
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

  if (p.air === AIR_RISING) {
    rising(state);
    ceiling(state);
  }

  falling(state);
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

/** ROM: loc_00_1ABB - gravity while not rising, with the unsigned clamp. */
function falling(state) {
  const p = state.player;
  const t = state.tunables;

  if (p.springArmed) return;                       // $1ABF
  if (p.clingLock & 0x1F) return;                  // $1AC2
  if (p.action !== 0 && (p.action & 1) === 0) return;  // $1AC8
  if (p.air === AIR_RISING) return;                // $1AD4

  if (!(state.input.held & BTN.A)) p.jumpReleased = 1;   // $1AE0

  // $1AE4: in water gravity is applied only 1 frame in 8.
  let g;
  if (p.slowMode) {
    if ((state.frame & 0x07) !== 0) { integrateFall(state); return; }
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

/** ROM: $C72F/$C730 - conveyors and moving platforms displace the player. */
function applyCarry(state) {
  const c = state.carry;
  if (c.x) { state.player.x = (state.player.x + c.x) & 0xFFFF; c.x = 0; }
  if (c.y) { state.player.y = (state.player.y + c.y) & 0xFFFF; c.y = 0; }
}

// ---------------------------------------------------------------------------
// Animation select.  ROM: $1B6A-$1BFF (partial - P1 covers the ground/air set).
// ---------------------------------------------------------------------------

/**
 * Animation ids, read off the real game with tools/oracle/animmap.mjs rather
 * than guessed. These are load-bearing: the hitbox is looked up per animation
 * from 0:$27A8, and the airborne poses are 1 px narrower (halfW 14) than the
 * grounded ones (halfW 15). Using the wrong id changes collision, not just
 * pixels.
 */
export const ANIM = {
  WALK_CYCLE: [0x00, 0x01, 0x02, 0x03],   // grounded + moving, ~7 frames each
  WALK_FRAME_TICKS: 7,
  IDLE: 0x06,                              // grounded + still
  LAND: 0x07,                              // landing squat
  RISING: 0x08,
  FALL_START: 0x09,                        // first ~8 frames of a fall
  FALL: 0x0A,
  FALL_START_TICKS: 8,
  TURN_A: 0x14, TURN_B: 0x13,              // $1BD3 skid pair
  CLING_A: 0x11, CLING_B: 0x12,            // wall-cling hold poses
};

/**
 * Attack poses by attack-timer value, read off the real game with the oracle.
 * Index 0 is unused (timer 0 means "not attacking").
 *
 * Without these the attack still fires -- damage, ammo, batarangs all work --
 * but Batman never changes pose, so pressing the button looks like it does
 * nothing at all.
 */
const PUNCH_ANIM = [0, 11, 11, 11, 12, 12, 12, 12, 12, 12, 12, 12, 11, 11, 11, 11];
const THROW_ANIM = [0, 21, 21, 21, 22, 22, 22, 22, 12, 12, 12, 12, 12, 12, 12, 12];

function selectAnim(state) {
  const p = state.player;

  let id;
  if (p.attackTimer > 0) {
    // An attack in progress overrides every other pose.
    const table = p.attackPose ? THROW_ANIM : PUNCH_ANIM;
    id = table[p.attackTimer] ?? table[table.length - 1];
  } else if (p.turnTimer > 0) {
    // $1BAC: alternate two skid frames off bit 3 of the countdown.
    p.turnTimer--;
    id = (p.turnTimer & 0x08) ? ANIM.TURN_A : ANIM.TURN_B;
    p.animTimer = 5;
  } else if ((p.clingLock & 0x1F) !== 0) {
    // Wall-cling poses. The switch point is empirical (oracle: $11 while the
    // countdown is above 5, $12 below).
    id = (p.clingLock & 0x1F) > 5 ? ANIM.CLING_A : ANIM.CLING_B;
  } else if (p.air === AIR_RISING) {
    id = ANIM.RISING;                       // $1B99
  } else if (p.air === AIR_FALLING) {
    // $1B9F: a short entry pose, then the sustained falling pose.
    if (p.anim !== ANIM.FALL_START && p.anim !== ANIM.FALL) {
      p.fallTicks = 0;
      id = ANIM.FALL_START;
    } else {
      p.fallTicks = (p.fallTicks || 0) + 1;
      id = p.fallTicks >= ANIM.FALL_START_TICKS ? ANIM.FALL : ANIM.FALL_START;
    }
  } else if (p.vx !== 0) {
    p.walkTicks = (p.walkTicks || 0) + 1;
    if (p.walkTicks >= ANIM.WALK_FRAME_TICKS) {
      p.walkTicks = 0;
      p.walkStep = ((p.walkStep || 0) + 1) % ANIM.WALK_CYCLE.length;
    }
    id = ANIM.WALK_CYCLE[p.walkStep || 0];
  } else {
    id = ANIM.IDLE;
    p.walkTicks = 0;
    p.walkStep = 0;
  }

  if (id !== p.anim) {
    p.anim = id;
    p.animPrev = 0xFF;                      // force a full 3-column repaint
    p.animFrame = 0;
  }
  // Metasprite index == facing, verified against the real shadow OAM with
  // tools/oracle/checksprite.py: facing 0 (right) selects entry 0, whose attr
  // is $30 (X-flipped); facing 1 (left) selects entry 1, attr $10.
  //
  // $1BA3 reads `LDH A,[$FF88] / XOR $01 / LDH [$FF8B],A`, which looks like
  // facing XOR 1 -- but that arm is not the one the walk/idle path takes, and
  // taking it at face value draws Batman mirrored for his whole run.
  p.msIndex = p.facing;
}
