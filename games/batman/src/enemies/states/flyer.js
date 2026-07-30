// State 3 -- the flyer (levels 9, 10), and its attack tick.
//
// ROM range: jt_01_55AA (the handler, loc_01_55B4-$5750 its move/accel arms)
// and jt_01_6169 (the dive tick).
//
// THE PAIR MOVES TOGETHER because the tick does not end in a tail of its own:
// $61A9/$61AF hand off to loc_01_568C / loc_01_5740, the handler's OWN move
// arms, so attackTickFlyer FALLS INTO flyMoveRight/flyMoveLeft. Split them
// and the two halves import each other.
//
// The dive is also the only place in this state that probes the player
// (flyFree, $56ED), and $5703's $FF answer is routed to the WALL-HIT arm --
// a connected player and a wall end the dive the same way.

import { u8, i8 } from '../../state.js';
import {
  E_FLAGS, E_ANIM_TIMER, E_FACING, E_SCREEN_X, E_SCREEN_Y,
  E_X_LO, E_VX, E_SPEED_CAP,
} from '../record.js';
import {
  addX, absDiff8, playerScreenX, playerScreenY, requestSound,
} from '../util.js';
import { probeRight, probeLeft, attackProbe } from '../probe.js';
import { riseTail, fallTail } from '../tails.js';

// ---------------------------------------------------------------------------
// State 3 -- flyer (levels 9, 10).  ROM: jt_01_55AA.
// ---------------------------------------------------------------------------

export function stFlyer(state, r) {
  if (r[E_FLAGS] & 0x03) return flyAirMove(state, r);     // $55AC
  const f1 = r[1];
  if (f1 & 0x60) return flyAirMove(state, r);       // $55D1: keep momentum
  if (f1 & 0x10) {                                  // $55D9: committed flight
    if (r[0x15] === 0) { r[1] &= ~0x10; return riseTail(state, r); }  // $5648
    r[0x15]--;
    return r[E_FACING] === 0 ? flyAccelRight(state, r) : flyAccelLeft(state, r);
  }

  const psx = playerScreenX(state);
  const diff = u8(psx - r[E_SCREEN_X]);             // $55E2
  if (diff === 0) {                                 // $55E5 -> $5653
    r[1] = (r[1] & 0xF3) | 0x10;
    r[0x15] = 0x10;
    return riseTail(state, r);
  }
  const playerLeft = psx < r[E_SCREEN_X];
  const ad = playerLeft ? u8(-diff) : diff;
  if (ad < 0x30 && absDiff8(playerScreenY(state), r[E_SCREEN_Y]) < 0x20) {   // $5606
    // $560A: dive. The direction is the CURRENT facing, not the player side.
    r[E_FLAGS] |= 0x08;
    r[E_ANIM_TIMER] = 0x30;                         // $5613: faster flapping
    r[E_VX] = r[E_FACING] === 0 ? 0x30 : 0xD0;      // $561F / $5624
    return fallTail(state, r);
  }
  return playerLeft ? flyAccelLeft(state, r) : flyAccelRight(state, r);   // $55F1
}

/** ROM: loc_01_55B4 */
export function flyAirMove(state, r) {
  const v = r[E_VX];
  return (v & 0x80) ? flyMoveLeft(state, r, v) : flyMoveRight(state, r, v);
}

/** ROM: loc_01_5667 */
export function flyAccelRight(state, r) {
  r[E_FACING] = 0;
  let v = r[E_VX];
  if (v & 0x80) {
    v = u8(v + 2);                                  // $56DC
    r[E_VX] = v;
    return (v & 0x80) ? flyMoveLeft(state, r, v) : flyMoveRight(state, r, v);
  }
  const max = r[E_SPEED_CAP];
  v = v + 1 < max ? v + 1 : max;
  r[E_VX] = v;
  return flyMoveRight(state, r, v);
}

/** ROM: loc_01_5712 */
export function flyAccelLeft(state, r) {
  r[E_FACING] = 1;
  let v = r[E_VX];
  if (v !== 0 && (v & 0x80) === 0) {
    v = u8(v - 2);                                  // $5750
    r[E_VX] = v;
    return (v & 0x80) ? flyMoveLeft(state, r, v) : flyMoveRight(state, r, v);
  }
  const min = u8(-r[E_SPEED_CAP]);
  v = u8(v - 1);
  if (v < min) v = min;
  r[E_VX] = v;
  return flyMoveLeft(state, r, v);
}

/** ROM: loc_01_568C */
export function flyMoveRight(state, r, v) {
  addX(r, i8(v));
  if (probeRight(state, r) !== 0) {
    r[E_X_LO] = 0x40;                               // $5696: flyer snap point
    return flyWallHit(state, r);
  }
  return flyFree(state, r);
}

/** ROM: loc_01_5740 */
export function flyMoveLeft(state, r, v) {
  addX(r, i8(v));
  if (probeLeft(state, r) !== 0) {
    r[E_X_LO] = 0xB0;                               // $574A
    return flyWallHit(state, r);
  }
  return flyFree(state, r);
}

/**
 * ROM: loc_01_5699. Wall contact resets the flap speed and (if level) starts
 * the turn animation at the current facing -- whose expiry, like the walkers',
 * fires the +$1C jump. That upward hop is how flyers regain altitude.
 */
export function flyWallHit(state, r) {
  r[E_ANIM_TIMER] = 0x50;                           // $569D
  r[E_FLAGS] &= ~0x08;                              // $56A6
  if (r[E_FLAGS] & 0x01) return riseTail(state, r);
  if (r[E_FLAGS] & 0x02) return fallTail(state, r);
  if ((r[1] & 0x60) === 0) {                        // $56B3
    r[1] |= 0x40;                                   // $56BB
    r[E_VX] = r[E_FACING] === 0 ? 0x10 : 0xF0;      // $56C9 / $56CD
    r[0x18] = 0x0C;                                 // $56D4
  }
  return riseTail(state, r);
}

/** ROM: loc_01_56E7 - free flight; while diving, probe the player each frame. */
export function flyFree(state, r) {
  if ((r[E_FLAGS] & 0x08) === 0) return riseTail(state, r);   // $56ED
  if ((state.frame & 0x07) === 0) requestSound(state, 0x1E);   // $56F2
  if (attackProbe(state, r) === 0xFF) return flyWallHit(state, r);   // $5703
  return riseTail(state, r);
}

/** ROM: jt_01_6169 - flyer dive/knockback: X speed decays 1/frame toward 0. */
export function attackTickFlyer(state, r) {
  const v = u8((r[E_FACING] & 1) === 0 ? r[E_VX] - 1 : r[E_VX] + 1);   // $6177 / $618E
  if (v === 0) {                                    // $61A1: recovered
    r[E_FLAGS] &= 0xC7;
    r[E_ANIM_TIMER] = 0x50;
    return riseTail(state, r);
  }
  r[E_VX] = v;
  return (v & 0x80) ? flyMoveLeft(state, r, v) : flyMoveRight(state, r, v);
}
