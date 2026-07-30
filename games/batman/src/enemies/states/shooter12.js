// State 6 -- the level-12 pacing shooter, and its attack tick.
//
// ROM range: jt_01_57D6 with loc_01_57DC/$583E/$5935/$595A/$5989/$59B7, and
// jt_01_61B3 (the tick).
//
// THE PAIR MOVES TOGETHER: $61D5's arm and the count-down arm both end at
// loc_01_5BB6, but the tick's whole job is to unwind the pose THIS handler
// set at $5854/$5856, and $61C7's r[1] rewrite is the other half of the
// pacing latch the handler reads at $5803/$5808. They are one unit.
//
// It fires through sub_01_6BDC (enemies/states/projectile.js) -- the shot
// sets the MELEE bit at $5856, which is why hitDispatch routes state 6 to
// jt_01_61B3 and not to the ranged tick.

import { u8, u16, i8 } from '../../state.js';
import { spawnEffect } from '../../doors.js';
import {
  E_FLAGS, E_FACING, E_SCREEN_X, E_SCREEN_Y,
  E_X_HI, E_X_LO, E_Y_HI, E_Y_LO, E_VX, E_SPEED_CAP,
} from '../record.js';
import { addX, absDiff8, playerScreenX, playerScreenY } from '../util.js';
import { probeRight, probeLeft } from '../probe.js';
import { riseTail } from '../tails.js';
import { spawnProjectile } from './projectile.js';

// ---------------------------------------------------------------------------
// State 6 -- the level-12 pacing shooter.  ROM: jt_01_57D6.
//
// Distance bands like the walkers, but the signature move is the PACING mode:
// r[1] bits 2/3 latch a fixed walk direction, flipped on every wall contact
// ($596F / $59CC), and while pacing the enemy fires whenever its world COLUMN
// (X hi byte, not screen X) comes within 3 of the player's. The shot sets the
// MELEE bit ($5856 SET 3), which is why hitDispatch routes state 6 through
// jt_01_61B3 rather than the ranged tick.
// ---------------------------------------------------------------------------

export function stL12(state, r) {
  if (r[E_FLAGS] & 0x04) return l12Drift(state, r);       // $57D8: stunned -- drift
  const f1 = r[1];                                  // $57F7
  if (f1 & 0x20) {                                  // $57F9: landing anim
    r[E_FLAGS] &= ~0x20;                            // $5838
    return l12Drift(state, r);                      // $583A -> $57DC
  }
  if (f1 & 0x10) {                                  // $57FE: committed pause
    if (r[0x15] === 0) { r[1] &= ~0x10; return riseTail(state, r); }  // $58EF
    r[0x15]--;                                      // $58DF
    return r[E_FACING] === 0 ? l12WalkRight(state, r) : l12WalkLeft(state, r);
  }
  if (f1 & 0x04) {                                  // $5803: pacing right
    if (absDiff8(state.player.x >> 8, r[E_X_HI]) < 3) return l12Fire(state, r);
    return l12WalkRight(state, r);                  // $591C -> $5935
  }
  if (f1 & 0x08) {                                  // $5808: pacing left
    if (absDiff8(state.player.x >> 8, r[E_X_HI]) < 3) return l12Fire(state, r);
    return l12WalkLeft(state, r);                   // $592F -> $5989
  }

  const psx = playerScreenX(state);
  const diff = u8(psx - r[E_SCREEN_X]);             // $5812
  const playerLeft = psx < r[E_SCREEN_X];
  const ad = playerLeft ? u8(-diff) : diff;
  if (ad >= 0x40) {                                 // $581A: far band
    if (absDiff8(playerScreenY(state), r[E_SCREEN_Y]) < 0x20) {   // $5829
      return l12Fire(state, r);                     // $583D -> $583E
    }
    r[E_FLAGS] |= 0x20;                             // $5832: idle
    return riseTail(state, r);
  }
  if (ad < 8) {                                     // $58B2: too close
    r[1] = (r[1] & 0xF3) | 0x10;                    // $58FA: commit the pause
    r[0x15] = 0x20;                                 // $5906
    return riseTail(state, r);
  }
  // $58BA: mid band. Walk toward the player -- or AWAY while r[1] bit 7 (the
  // wall-jump latch, reused here) is set ($58C1 inverts the choice).
  r[E_FLAGS] &= ~0x20;                              // $58BE
  const goLeft = (r[1] & 0x80) ? !playerLeft : playerLeft;   // $58C7 / $58D0
  return goLeft ? l12WalkLeft(state, r) : l12WalkRight(state, r);
}

/**
 * ROM: loc_01_583E - fire: spawn the mode-2 projectile (result IGNORED,
 * unlike state 2's zero test) and hold the attack pose $0F frames with the
 * MELEE bit, then throw TWO muzzle flashes into the $C693 pool.
 *
 * $D7, not $97, and the difference is bit 6: doors.js's tickEffect suppresses
 * the $13DC one-shot when it is set, so these two are SILENT. They still
 * occupy pool slots for their $17 ticks, and that is exactly how they were
 * caught -- with only 10 slots, two silent tenants change how many of level
 * 12's collapsing-floor bursts find a slot at all. MEASURED (cuediff
 * l12-shooter-fire): the cartridge lands 8 floor cues in its first burst and
 * the port, two slots richer, landed 10.
 */
export function l12Fire(state, r) {
  if (r[E_FLAGS] & 0x08) return riseTail(state, r);       // $583F: already firing
  spawnProjectile(state, r, 2);                     // $584B: $C72C = 2
  r[E_FLAGS] = (r[E_FLAGS] & ~0x20) | 0x08;         // $5854 / $5856
  r[0x14] = 0x0F;                                   // $585C
  // $5860-$587E: X + ($FE80 facing left, $FF40 facing right), and $5884-$5894
  // Y - $80. $589F then adds 2 to the HIGH byte alone for the second flash,
  // which is one whole column to the right.
  const fx = u16(((r[E_X_HI] << 8) | r[E_X_LO])
                 + ((r[E_FACING] & 1) ? 0xFE80 : 0xFF40));  // $586C-$5878
  const fy = u16(((r[E_Y_HI] << 8) | r[E_Y_LO]) + 0xFF80);
  spawnEffect(state, fx, fy, 0xD7, 0x00);            // $589C
  spawnEffect(state, u16(fx + 0x0200), fy, 0xD7, 0x00);   // $58AB
  return riseTail(state, r);
}

/** ROM: loc_01_57DC - stunned / landing: keep moving at the +$12 velocity. */
export function l12Drift(state, r) {
  const v = r[E_VX];
  return (v & 0x80) ? l12MoveLeft(state, r, v) : l12MoveRight(state, r, v);
}

/** ROM: loc_01_5935 - accelerate right toward the +$1D cap (walker idiom). */
export function l12WalkRight(state, r) {
  r[E_FACING] = 0;                                  // $5939
  let v = r[E_VX];
  if (v & 0x80) {                                   // $593F: moving left still
    v = u8(v + 2);                                  // $5977: brake by 2
    r[E_VX] = v;
    return (v & 0x80) ? l12MoveLeft(state, r, v) : l12MoveRight(state, r, v);
  }
  const max = r[E_SPEED_CAP];                       // $5944-$5951
  v = v + 1 < max ? v + 1 : max;
  r[E_VX] = v;
  return l12MoveRight(state, r, v);
}

/** ROM: loc_01_5989 - mirror. */
export function l12WalkLeft(state, r) {
  r[E_FACING] = 1;                                  // $598C
  let v = r[E_VX];
  if (v !== 0 && (v & 0x80) === 0) {                // $5995 / $5997
    v = u8(v - 2);                                  // $59D4
    r[E_VX] = v;
    return (v & 0x80) ? l12MoveLeft(state, r, v) : l12MoveRight(state, r, v);
  }
  const min = u8(-r[E_SPEED_CAP]);                  // $599C-$59AF
  v = u8(v - 1);
  if (v < min) v = min;                             // unsigned clamp
  r[E_VX] = v;
  return l12MoveLeft(state, r, v);
}

/** ROM: loc_01_595A - a wall stops it dead (snap $40, the FLYER's point, not
 *  the walkers' $80) and flips the pacing mode to leftward. */
export function l12MoveRight(state, r, v) {
  addX(r, i8(v));
  if (probeRight(state, r) !== 0) {                 // $595D
    r[E_X_LO] = 0x40;                               // $5964
    r[E_VX] = 0;                                    // $596A
    r[1] = (r[1] & ~0x04) | 0x08;                   // $596F / $5971
  }
  return riseTail(state, r);                        // $5974 / $5982
}

/** ROM: loc_01_59B7 - mirror: snap $B0, mode flips to rightward. */
export function l12MoveLeft(state, r, v) {
  addX(r, i8(v));
  if (probeLeft(state, r) !== 0) {                  // $59BA
    r[E_X_LO] = 0xB0;                               // $59C1
    r[E_VX] = 0;
    r[1] = (r[1] & ~0x08) | 0x04;                   // $59CC / $59CE
  }
  return riseTail(state, r);
}

/** ROM: jt_01_61B3 - state 6 pause after its attack. */
export function attackTickL12(state, r) {
  if (r[0x14] !== 0) { r[0x14]--; return riseTail(state, r); }
  r[E_FLAGS] &= 0xC7;
  r[1] = (r[1] & 0xF3) | 0x10;
  r[0x15] = 0x28;                                   // $61D5
  return riseTail(state, r);
}
