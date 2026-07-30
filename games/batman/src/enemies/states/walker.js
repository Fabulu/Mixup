// States 1 and 2 -- the walker and the walker+jump, and state 2's attack tick.
//
// ROM range: jt_01_50ED with loc_01_515D/$51DB/$51F6/$52FB/$50F7 (state 1),
// jt_01_5399 with loc_01_54AC/$5437/$54C0/$555F/$53A3 (state 2), and
// jt_01_612E (state 2's tick).
//
// TWO STATES, ONE FILE, and the manifest says so: game.json's enemies[]
// entries for states 1 and 2 both name this module. They are the same enemy
// shape with two differences -- state 2's close band is $18 wide against $14,
// and state 2 has a far-band RANGED attack (the $53EC exact-row test firing
// sub_01_6BDC mode 1) that state 1 does not. Everything they share lives in
// enemies/states/walkershared.js, which both of them pass their own wall
// reaction into.
//
// State 2's tick moves with them because $6148-$6161 is the other end of the
// commit-to-a-walk latch this file reads at $53CA: the tick sets r[1] bit 4,
// flips the facing and arms +$15, and stWalkerJump is what spends it. State 1
// has no tick of its own -- hitDispatch sends it to the shared jt_01_6107,
// which stays in the driver with the dispatch table.

import { u8 } from '../../state.js';
import {
  E_FLAGS, E_FACING, E_SCREEN_X, E_SCREEN_Y, E_VX, E_SPEED_CAP,
} from '../record.js';
import {
  absDiff8, playerScreenX, playerScreenY, requestSound,
} from '../util.js';
import { attackProbe } from '../probe.js';
import { riseTail, fallTail } from '../tails.js';
import {
  walkerMoveRight, walkerMoveLeft, wallStopWalker, wallStopWalkerJump,
} from './walkershared.js';
import { spawnProjectile } from './projectile.js';

// ---------------------------------------------------------------------------
// State 1 -- walker (levels 1-3).  ROM: jt_01_50ED.
// ---------------------------------------------------------------------------

export function stWalker(state, r) {
  if (r[E_FLAGS] & 0x03) return walkerAirMove(state, r);  // $50EF: airborne
  const f1 = r[1];                                  // $5113
  if (f1 & 0x60) {                                  // $5114: turn/landing anim
    r[E_FLAGS] &= ~0x20;                            // $51B4
    return walkerAirMove(state, r);                 // move at r[$12] regardless
  }
  if (f1 & 0x10) {                                  // $511E: committed walk
    if (r[0x15] === 0) { r[1] &= ~0x10; return riseTail(state, r); }  // $51D0
    r[0x15]--;                                      // $51C0
    return r[E_FACING] === 0 ? walkerWalkRight(state, r) : walkerWalkLeft(state, r);
  }

  const psx = playerScreenX(state);                 // $FF93
  const diff = u8(psx - r[E_SCREEN_X]);             // $5128: vs the STORED screen X
  if (diff === 0) return walkerFacePause(state, r); // $512B
  const playerLeft = psx < r[E_SCREEN_X];
  const ad = playerLeft ? u8(-diff) : diff;

  if (ad < 0x14) {                                  // $5133
    if (ad < 8) return walkerFacePause(state, r);   // $516E: too close
    if (absDiff8(playerScreenY(state), r[E_SCREEN_Y]) >= 0x18) {   // $5180
      return walkerWalkToward(state, r, playerLeft);
    }
    if (state.player.iframes !== 0) return walkerFacePause(state, r);  // $5184
    requestSound(state, 0x1A);                      // $518F: melee attack
    r[E_FLAGS] |= 0x08;                             // $5195
    r[E_FACING] = playerLeft ? 1 : 0;               // $519C
    r[0x14] = 0x13;                                 // $51A8
    r[E_FLAGS] &= ~0x20;
    return fallTail(state, r);
  }
  if (ad < 0x30) return walkerWalkToward(state, r, playerLeft);   // $5137
  if (absDiff8(playerScreenY(state), r[E_SCREEN_Y]) < 0x30) {     // $5145
    return walkerWalkToward(state, r, playerLeft);
  }
  r[E_FLAGS] |= 0x20;                               // $514E: idle, player far
  r[E_VX] = 0;
  return fallTail(state, r);
}

/** ROM: loc_01_515D */
export function walkerWalkToward(state, r, playerLeft) {
  r[E_FLAGS] &= ~0x20;
  return playerLeft ? walkerWalkLeft(state, r) : walkerWalkRight(state, r);
}

/**
 * ROM: loc_01_51DB. Directly under/over the player (or in the dead zone): stop
 * and commit for $20 frames. Quirk: the facing MIRRORS THE PLAYER'S ($FF88
 * XOR 1) rather than being computed from relative position.
 */
export function walkerFacePause(state, r) {
  r[1] = (r[1] & 0xF3) | 0x10;
  r[E_FACING] = state.player.facing ^ 1;            // $51E5
  r[0x15] = 0x20;
  return riseTail(state, r);
}

/** ROM: loc_01_51F6 - accelerate right by 1/frame toward the +$1D cap. */
export function walkerWalkRight(state, r) {
  r[E_FACING] = 0;                                  // $51F9
  let v = r[E_VX];
  if (v & 0x80) {                                   // $5200: still moving left
    v = u8(v + 2);                                  // $52F0: brake by 2
    r[E_VX] = v;
    return (v & 0x80) ? walkerMoveLeft(state, r, v, wallStopWalker)
      : walkerMoveRight(state, r, v, wallStopWalker);
  }
  const max = r[E_SPEED_CAP];                       // $520B
  v = v + 1 < max ? v + 1 : max;
  r[E_VX] = v;
  return walkerMoveRight(state, r, v, wallStopWalker);
}

/** ROM: loc_01_52FB - mirror. */
export function walkerWalkLeft(state, r) {
  r[E_FACING] = 1;                                  // $52FE
  let v = r[E_VX];
  if (v !== 0 && (v & 0x80) === 0) {                // $5306/$5309: moving right
    v = u8(v - 2);                                  // $538D
    r[E_VX] = v;
    return (v & 0x80) ? walkerMoveLeft(state, r, v, wallStopWalker)
      : walkerMoveRight(state, r, v, wallStopWalker);
  }
  const min = u8(-r[E_SPEED_CAP]);                  // $5315
  v = u8(v - 1);
  if (v < min) v = min;                             // $531D: unsigned clamp
  r[E_VX] = v;
  return walkerMoveLeft(state, r, v, wallStopWalker);
}

/** ROM: loc_01_50F7 - airborne (or mid-anim): move at r[$12], sign-split. */
export function walkerAirMove(state, r) {
  const v = r[E_VX];
  return (v & 0x80) ? walkerMoveLeft(state, r, v, wallStopWalker)
    : walkerMoveRight(state, r, v, wallStopWalker);
}

// ---------------------------------------------------------------------------
// State 2 -- walker+jump (levels 5, 7, 13).  ROM: jt_01_5399.
// ---------------------------------------------------------------------------

export function stWalkerJump(state, r) {
  if (r[E_FLAGS] & 0x03) return wjAirMove(state, r);      // $539B
  const f1 = r[1];
  if (f1 & 0x60) {                                  // $53C0
    r[E_FLAGS] &= ~0x20;                            // $5484
    return wjAirMove(state, r);
  }
  if (f1 & 0x10) {                                  // $53CA: committed walk
    if (r[0x15] === 0) { r[1] &= ~0x10; return riseTail(state, r); }  // $54A1
    r[0x15]--;
    return r[E_FACING] === 0 ? wjWalkRight(state, r) : wjWalkLeft(state, r);
  }

  const psx = playerScreenX(state);
  const diff = u8(psx - r[E_SCREEN_X]);             // $53D4
  if (diff === 0) return wjPause(state, r);         // $53D7
  const playerLeft = psx < r[E_SCREEN_X];
  const ad = playerLeft ? u8(-diff) : diff;

  if (ad < 0x18) {                                  // $53DF
    if (ad < 8) return wjPause(state, r);           // $5448
    if (absDiff8(playerScreenY(state), r[E_SCREEN_Y]) >= 0x20) {   // $545A
      return wjWalkToward(state, r, playerLeft);
    }
    requestSound(state, 0x1C);                      // $5460: melee lunge
    r[E_FLAGS] |= 0x08;                             // $5466
    r[E_FACING] = playerLeft ? 1 : 0;               // $546D
    r[0x14] = 0x1F;                                 // $5479
    r[E_FLAGS] &= ~0x20;
    return fallTail(state, r);
  }
  if (ad < 0x30) return wjWalkToward(state, r, playerLeft);   // $53E3
  // Far band:
  if (playerScreenY(state) === r[E_SCREEN_Y]) {     // $53EC: EXACT row match
    r[E_FACING] = playerLeft ? 1 : 0;               // $540F
    if (spawnProjectile(state, r, 1) === 0) {       // $541E: sub_01_6BDC mode 1
      r[E_FLAGS] = (r[E_FLAGS] & ~0x20) | 0x10;     // $5427: ranged attack
      r[0x14] = 0x0F;                               // $542F
    }
    return fallTail(state, r);
  }
  r[E_FACING] = playerLeft ? 1 : 0;                 // $53F1: idle facing player
  r[E_FLAGS] |= 0x20;                               // $53FE
  r[E_VX] = 0;
  return fallTail(state, r);
}

/** ROM: loc_01_54AC - commit to the current facing for $28 frames (no turn). */
export function wjPause(state, r) {
  r[1] = (r[1] & 0xF3) | 0x10;
  r[0x15] = 0x28;                                   // $54B8
  return riseTail(state, r);
}

/** ROM: loc_01_5437 */
export function wjWalkToward(state, r, playerLeft) {
  r[E_FLAGS] &= ~0x20;
  return playerLeft ? wjWalkLeft(state, r) : wjWalkRight(state, r);
}

/** ROM: loc_01_54C0 - identical accel to state 1, different wall behaviour. */
export function wjWalkRight(state, r) {
  r[E_FACING] = 0;
  let v = r[E_VX];
  if (v & 0x80) {
    v = u8(v + 2);                                  // $5554
    r[E_VX] = v;
    return (v & 0x80) ? walkerMoveLeft(state, r, v, wallStopWalkerJump)
      : walkerMoveRight(state, r, v, wallStopWalkerJump);
  }
  const max = r[E_SPEED_CAP];
  v = v + 1 < max ? v + 1 : max;
  r[E_VX] = v;
  return walkerMoveRight(state, r, v, wallStopWalkerJump);
}

/** ROM: loc_01_555F */
export function wjWalkLeft(state, r) {
  r[E_FACING] = 1;
  let v = r[E_VX];
  if (v !== 0 && (v & 0x80) === 0) {
    v = u8(v - 2);                                  // $559E
    r[E_VX] = v;
    return (v & 0x80) ? walkerMoveLeft(state, r, v, wallStopWalkerJump)
      : walkerMoveRight(state, r, v, wallStopWalkerJump);
  }
  const min = u8(-r[E_SPEED_CAP]);
  v = u8(v - 1);
  if (v < min) v = min;
  r[E_VX] = v;
  return walkerMoveLeft(state, r, v, wallStopWalkerJump);
}

/** ROM: loc_01_53A3 */
export function wjAirMove(state, r) {
  const v = r[E_VX];
  return (v & 0x80) ? walkerMoveLeft(state, r, v, wallStopWalkerJump)
    : walkerMoveRight(state, r, v, wallStopWalkerJump);
}

/** ROM: jt_01_612E - state 2 turns AWAY after the lunge and commits to it. */
export function attackTickWalkerJump(state, r) {
  if (r[0x14] !== 0) {
    r[0x14]--;
    attackProbe(state, r);
    return riseTail(state, r);
  }
  r[E_FLAGS] &= 0xC7;                               // $6148
  r[1] = (r[1] & 0xF3) | 0x10;                      // committed walk
  r[E_FACING] ^= 1;                                 // $615A
  r[0x15] = 0x18;                                   // $6161
  return riseTail(state, r);
}
