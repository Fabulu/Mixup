// State 8 -- Boss 3 (level 11), and its attack tick.
//
// ROM range: jt_01_7061 with loc_01_7125/$7143/$71B0/$7209/$7235, and
// jt_01_621F with loc_01_62A0.
//
// THE PAIR MOVES TOGETHER: the normal branch of the tick ends at $62FB with
// `JP jt_01_7061`, so it FALLS THROUGH into the full handler exactly the way
// boss 1's does, and the crit branch drives the handler's own $71B0/$7209
// move arms. Neither half stands alone.
//
// loc_01_4FF5 (boss3Knockback) is NOT here. It is one of the ten arms of the
// hit ladder and it ends in primaryDispatch, so it belongs to the driver --
// the same reason stunnedTick and stunExpired do.

import { u8, i8 } from '../../state.js';
import {
  E_FLAGS, E_FACING, E_SCREEN_X, E_X_HI, E_X_LO, E_VX, E_HP, E_PROBE_DY,
} from '../record.js';
import { addX, playerScreenX, requestSound } from '../util.js';
import { probeRight, probeLeft, attackProbe } from '../probe.js';
import { riseTail, fallTail } from '../tails.js';
import { spawnProjectile } from '../states/projectile.js';

// ---------------------------------------------------------------------------
// State 8 -- Boss 3 (level 11).  ROM: jt_01_7061.
//
// A dash fighter with two attacks off one melee bit. NORMAL ($C73F clear):
// an $0B-frame pose that probes (and, with bit 4, shoots) at timer 7 and
// CHAINS -- expiry re-launches a $30-speed dash while the player stays in the
// $0C-$60 band. CRIT ($C73F set): a $2C-speed lunge whose velocity decays 1
// per frame, ricocheting off the arena edges (X hi < 2 or >= $0A flips the
// facing and re-arms). The crit flag is raised point-blank (< $0C px), by the
// far-band patience counter ($C741 ticking on ODD $FFB1 frames to $B4), or by
// the ricochet itself. Enraged (HP < $0E, non-easy) the mid band swaps the
// chase for the ranged bit-4 attack.
// ---------------------------------------------------------------------------

export function stBoss3(state, r) {
  if (r[E_HP] < 0x0E && state.flow.difficulty !== 0) {
    state.flow.bossRage = 1;                        // $7068-$7074: $C73D
  }
  if (r[E_FLAGS] & 0x07) {                          // $7079-$7083
    const v = r[E_VX];
    return (v & 0x80) ? boss3MoveLeft(state, r, v) : boss3MoveRight(state, r, v);
  }
  if (r[E_FLAGS] & 0x18) return riseTail(state, r);       // $70A1
  if (r[1] & 0x20) {                                // $70A8: landing anim
    r[E_FLAGS] &= ~0x20;                            // $7186
    return riseTail(state, r);
  }

  const psx = playerScreenX(state);                 // $70B1 vs the cached +7
  const diff = u8(psx - r[E_SCREEN_X]);             // (no dead-zone special
  const playerLeft = psx < r[E_SCREEN_X];           //  case in this handler)
  const ad = playerLeft ? u8(-diff) : diff;

  if (ad < 0x28) {                                  // $70BA: close band
    if (ad < 0x0C) state.flow.bossCrit = 1;         // $711C-$7122: point-blank
    return boss3Attack(state, r, playerLeft);       // $7125
  }
  if (ad < 0x60) {                                  // $70C0: mid band
    state.flow.bossHop = 0;                         // $70F0: patience reset
    if (!state.flow.bossRage) {                     // $70F4
      return boss3Attack(state, r, playerLeft);
    }
    r[E_FACING] = playerLeft ? 1 : 0;               // $70FA-$7104
    if ((r[E_FLAGS] & 0x18) === 0) {                // $7105 (always true here)
      r[E_FLAGS] = (r[E_FLAGS] & ~0x20) | 0x10;     // $710C/$710E: ranged
      r[0x14] = 0x1F;                               // $7114
    }
    return riseTail(state, r);                      // $7119
  }
  // $70C2: far band -- idle, with the patience counter ticking at 30 Hz.
  r[E_FACING] = playerLeft ? 1 : 0;                 // $70C6-$70CD
  r[E_FLAGS] |= 0x20;                               // $70D2
  if (state.frame & 0x01) {                         // $70D4: odd frames only
    const c = u8(state.flow.bossHop + 1);           // $70DA: $C741
    if (c >= 0xB4) {                                // $70DE: 180 ticks
      state.flow.bossCrit = 1;                      // $70E4
      return boss3Attack(state, r, playerLeft);     // $70E7 -> $7125
    }
    state.flow.bossHop = c;                         // $70E9
  }
  return fallTail(state, r);                        // $70ED
}

/** ROM: loc_01_7125 - launch an attack toward the player (both kinds). */
export function boss3Attack(state, r, playerLeft) {
  state.flow.bossHop = 0;                           // $7125: $C741 = 0
  if (r[E_FLAGS] & 0x18) return riseTail(state, r);       // $712C: already attacking
  r[E_FLAGS] |= 0x08;                               // $7134
  r[E_FACING] = playerLeft ? 1 : 0;                 // $713A-$7142
  return boss3Arm(state, r);                        // falls into $7143
}

/** ROM: loc_01_7143 - arm the timer/sound, and the crit lunge's velocity.
 *  Entered separately by the ricochet ($725B). */
export function boss3Arm(state, r) {
  if (state.flow.bossCrit) {                        // $7147
    requestSound(state, 0x2D);                      // $714D
    r[0x14] = 0x1F;                                 // $7153
  } else {
    requestSound(state, 0x27);                      // $7157
    r[0x14] = 0x0B;                                 // $715D
  }
  r[E_FLAGS] &= ~0x20;                              // $7162: RES 5
  if (state.flow.bossCrit) {                        // $7164
    r[E_VX] = (r[E_FACING] & 1) ? 0xD4 : 0x2C;      // $7171-$717F: +-$2C
  }
  return riseTail(state, r);                        // $7182
}

/** ROM: loc_01_71B0 - move right; a wall kills the whole attack ($C73F too). */
export function boss3MoveRight(state, r, v) {
  addX(r, i8(v));
  if (probeRight(state, r) !== 0) {                 // $71B3
    r[E_X_LO] = 0x40;                               // $71BB
    r[E_VX] = 0;                                    // $71C1
    state.flow.bossCrit = 0;                        // $71C2
    r[E_FLAGS] &= 0xC7;                             // $71CA
    return riseTail(state, r);
  }
  return boss3EdgeCheck(state, r);                  // $7235
}

/** ROM: loc_01_7209 - mirror (snap $B0). */
export function boss3MoveLeft(state, r, v) {
  addX(r, i8(v));
  if (probeLeft(state, r) !== 0) {                  // $720C
    r[E_X_LO] = 0xB0;
    r[E_VX] = 0;
    state.flow.bossCrit = 0;
    r[E_FLAGS] &= 0xC7;
    return riseTail(state, r);
  }
  return boss3EdgeCheck(state, r);
}

/**
 * ROM: loc_01_7235 - after an unobstructed step. At the arena edges (X hi
 * < 2 or >= $0A) an un-stunned boss RICOCHETS: turn, set $C73F, re-arm
 * ($725B -> $7143); a stunned one just stops. In the open, a crit lunge
 * probes at +$1F = 7 (downward) each frame and leaves $F6 behind in the
 * offset -- the value the ROM stores after the probe, kept faithfully.
 */
export function boss3EdgeCheck(state, r) {
  const xhi = r[E_X_HI];
  if (xhi < 2 || xhi >= 0x0A) {                     // $7236 / $723A
    if ((r[E_FLAGS] & 0x04) === 0) {                // $7242
      r[E_FLAGS] = (r[E_FLAGS] & 0xC7) | 0x08;      // $7248-$724D
      r[E_FACING] ^= 1;                             // $7253
      state.flow.bossCrit = 1;                      // $7258
      return boss3Arm(state, r);                    // $725B
    }
    r[E_VX] = 0;                                    // $7263: stunned -- stop
  }
  if (state.flow.bossCrit) {                        // $7268
    r[E_PROBE_DY] = 0x07;                           // $7277
    attackProbe(state, r);                          // $727A
    r[E_PROBE_DY] = 0xF6;                           // $727E
  }
  return riseTail(state, r);                        // $7285
}

/**
 * ROM: jt_01_621F - boss 3's attack tick. The crit branch IS the lunge: the
 * velocity decays toward 0 by 1 each frame and the movement runs through the
 * $71B0/$7209 arms (edge ricochet included); reaching 0 ends it. The normal
 * branch holds the pose, probing -- and with bit 4, firing the mode-4
 * projectile -- exactly when the timer passes 7, then falls through to the
 * full state handler ($62FB -> $7061) like boss 1's tick does.
 */
export function attackTickBoss3(state, r) {
  if (state.flow.bossCrit) {                        // $6221 -> $6253
    if (r[0x14] !== 0) r[0x14]--;                   // $6257-$625C
    let v;
    if ((r[E_FACING] & 0x01) === 0) v = u8(r[E_VX] - 1);   // $6261-$626A
    else v = u8(r[E_VX] + 1);                       // $627C-$6281
    if (v === 0) {                                  // $626B / $6282 -> $6293
      state.flow.bossCrit = 0;
      r[E_FLAGS] &= 0xC7;
      return riseTail(state, r);
    }
    r[E_VX] = v;
    return (v & 0x80) ? boss3MoveLeft(state, r, v) : boss3MoveRight(state, r, v);
  }
  if (r[0x14] === 0) return boss3AttackExpiry(state, r);   // $622D
  r[0x14]--;
  if (r[0x14] === 7) {                              // $6232
    attackProbe(state, r);                          // $623C
    if (r[E_FLAGS] & 0x10) spawnProjectile(state, r, 4);  // $6241-$624C
  }
  return stBoss3(state, r);                         // $62FB -> $7061
}

/** ROM: loc_01_62A0 - normal-attack expiry: chain a dash while the player
 *  stays in range, upgrade to the crit lunge point-blank. */
export function boss3AttackExpiry(state, r) {
  const wasMelee = (r[E_FLAGS] & 0x08) !== 0;       // $62A1/$62A7
  r[E_FLAGS] &= 0xC7;                               // $62A2
  if (!wasMelee) return riseTail(state, r);         // $62A9: the ranged one
  const psx = playerScreenX(state);                 // $62B1
  const diff = u8(psx - r[E_SCREEN_X]);
  const playerLeft = psx < r[E_SCREEN_X];
  const ad = playerLeft ? u8(-diff) : diff;
  if (ad < 0x0C) {                                  // $62B9
    state.flow.bossCrit = 1;                        // $62BD
    return boss3Attack(state, r, playerLeft);       // $62C2 -> $7125
  }
  if (ad >= 0x60) return riseTail(state, r);        // $62C5
  requestSound(state, 0x27);                        // $62CF: chained dash
  r[E_FLAGS] |= 0x08;                               // $62D6
  r[0x14] = 0x0B;                                   // $62E0
  r[E_FACING] = playerLeft ? 1 : 0;                 // $62E6/$62EC
  const v = playerLeft ? 0xD0 : 0x30;               // $62E8/$62EF
  r[E_VX] = v;
  return (v & 0x80) ? boss3MoveLeft(state, r, v) : boss3MoveRight(state, r, v);
}
