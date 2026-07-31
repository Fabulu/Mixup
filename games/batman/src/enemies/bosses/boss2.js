// State 7 -- Boss 2 (level 8) and its attack tick, plus state 13, the
// afterimages the enrage turns slots 1 and 2 into.
//
// ROM range: jt_01_6D8A with loc_01_6E43/$6EC7/$6F5C/$6F87/$6FF5/$6FAC/$7023/
// $7048/$6FC4, jt_01_61DD (the tick), and jt_01_78A7 (state 13).
//
// STATE 13 IS IN THIS FILE, and game.json's enemies[] entry for it names this
// module, because it is not an enemy -- it is boss 2's rendering. Its records'
// +6/+7/+8 are written by stBoss2's own history chain at $6DD2-$6DF1 and
// jt_01_78A7 does nothing but draw them on alternating parity frames. Put it
// in a file of its own and the two ends of one feedback loop stop being
// visible together.
//
// THE TICK MOVES WITH THE HANDLER: $6209 is `JP jt_01_6D8A`, the same
// fall-through bosses 1 and 3 have.
//
// boss1Aim comes from bosses/boss1.js: $6FDC CALLS sub_01_79DB. Boss 2
// borrows boss 1's aim routine, and the import says exactly that.

import { u8, i8 } from '../../state.js';
import {
  E_FLAGS, E_FACING, E_SCREEN_X, E_SCREEN_Y, E_X_LO, E_VX, E_HP,
  E_JUMP_VEL, E_SPEED_CAP,
} from '../record.js';
import {
  addX, absDiff8, playerScreenX, playerScreenY, requestSound,
} from '../util.js';
import { probeRight, probeLeft, attackProbe } from '../probe.js';
import { queueDraw } from '../anim.js';
import { riseTail, fallTail } from '../tails.js';
import { spawnProjectile } from '../states/projectile.js';
import { boss1Aim } from './boss1.js';

// ---------------------------------------------------------------------------
// State 7 -- Boss 2 (level 8).  ROM: jt_01_6D8A.
//
// A walker-shaped boss with boss 1's hop launcher (shorter wind-up: 8 frames
// against $0F) and a sustained swing: the attack tick re-arms its own timer
// to $28 on every MISSED probe, so the attack holds until it connects. The
// enrage at HP < $0E is the show piece -- it boosts the jump velocity/walk
// cap to $38/$14 and turns slots 1/2 into state-13 AFTERIMAGES, fed a
// snapshot of the boss's +6/+7/+8 draw bytes every 8th frame through a
// two-stage history chain, drawn on alternating parity frames.
//
// A batarang on a GROUNDED boss 2 does no damage but starts the $C741 spin
// (batarang.js $3CA0); the handler head counts it down and the $5D20 special
// draw shows the spin pose. Airborne, the same batarang takes the ordinary
// 1-damage arm -- the armor only works with feet on the ground.
// ---------------------------------------------------------------------------

export function stBoss2(state, r) {
  if (!state.flow.bossRage) {                       // $6D8C
    if (r[E_HP] < 0x0E && state.flow.difficulty !== 0) {   // $6D97-$6D9F
      state.flow.bossRage = 1;                      // $6DA3
      r[E_JUMP_VEL] = 0x38;                         // $6DAC: jump velocity
      r[E_SPEED_CAP] = 0x14;                        // $6DAF: walk cap
      state.enemies[1][0] = 0x80;                   // $6DB4
      state.enemies[2][0] = 0x81;                   // $6DB9
      state.enemies[1][2] = 0x0D;                   // $6DBE: state 13
      state.enemies[2][2] = 0x0D;
      state.enemies[1][0x16] = 0xFF;                // $6DC6
      state.enemies[2][0x16] = 0xFF;
    }
  } else if ((state.frame & 0x07) === 0) {          // $6DCC: afterimage chain
    const s1 = state.enemies[1], s2 = state.enemies[2];
    s2[6] = s1[6]; s2[E_SCREEN_X] = s1[E_SCREEN_X]; s2[E_SCREEN_Y] = s1[E_SCREEN_Y];    // $6DD2-$6DE1
    s1[6] = r[6]; s1[E_SCREEN_X] = r[E_SCREEN_X]; s1[E_SCREEN_Y] = r[E_SCREEN_Y];       // $6DE4-$6DF1
  }
  if (state.flow.bossHop !== 0) {                   // $6DF4: the spin-freeze
    state.flow.bossHop--;
    return fallTail(state, r);                      // $6E00
  }
  if (r[E_FLAGS] & 0x07) {                          // $6E05-$6E0F
    const v = r[E_VX];
    return (v & 0x80) ? boss2MoveLeft(state, r, v) : boss2MoveRight(state, r, v);
  }
  if (r[E_FLAGS] & 0x18) return riseTail(state, r);       // $6E2D
  if (r[1] & 0x10) {                                // $6E34: committed walk
    if (r[0x15] === 0) { r[1] &= ~0x10; return riseTail(state, r); }  // $6F51
    r[0x15]--;                                      // $6F41
    return r[E_FACING] === 0 ? boss2WalkRight(state, r) : boss2WalkLeft(state, r);
  }
  if (r[1] & 0x60) {                                // $6E39/$6E3E: mid-anim
    r[E_FLAGS] &= ~0x20;                            // $6F34
    return riseTail(state, r);
  }
  return boss2Bands(state, r);                      // $6E43
}

/**
 * ROM: loc_01_6E43. Also RE-ENTERED IN THE AIR: an unobstructed airborne
 * step comes back here ($7048 -> $7057), which is how the hop can turn into
 * the swing mid-flight; the ad >= $1F arm bails to the tails while airborne
 * ($6E5C -> $705D), so only the close band acts then.
 */
export function boss2Bands(state, r) {
  const psx = playerScreenX(state);                 // $6E48
  const diff = u8(psx - r[E_SCREEN_X]);
  if (diff === 0) return boss2MirrorPause(state, r);   // $6E4B -> $6F5C
  const playerLeft = psx < r[E_SCREEN_X];
  const ad = playerLeft ? u8(-diff) : diff;

  if (ad >= 0x1F) {                                 // $6E53
    if (r[E_FLAGS] & 0x03) return riseTail(state, r);     // $6E5C-$6E63 -> $705D
    if (ad < 0x30) return boss2Walk(state, r, playerLeft);   // $6E6A
    // $6E6E-$6E76 is a REGISTER CLOBBER, reproduced rather than fixed. A is the
    // absolute distance every CP in this ladder reads, and $6E72 overwrites it
    // with the $C73D byte. When that byte is non-zero, $6E76's `JR NZ` re-enters
    // the ladder at $6E8C carrying a 1 -- so `CP $50` sets carry, $6E8E's
    // `JR NC` is never taken, and the enraged FAR band falls to the HOP. The
    // throw at $6E9F is reachable ONLY from ad in [$50,$70). MEASURED
    // (armhits.py, l8-boss2-engage @ $C756=2): $6E78 far-idle 0x, $6E97 hop-arm
    // fires, and every $6EA5 throw comes from the legitimate band.
    let band = ad;
    if (ad >= 0x70) {
      if (!state.flow.bossRage) {                   // $6E76: JR NZ not taken
        r[E_FACING] = playerLeft ? 1 : 0;           // $6E78-$6E82: far idle
        r[E_FLAGS] |= 0x20;                         // $6E87
        return fallTail(state, r);                  // $6E89
      }
      band = u8(state.flow.bossRage);               // $6E72: A := [$C73D]
    }
    if (band < 0x50) {                              // $6E8C: [$30,$50), or far
      if (!state.flow.bossRage) return boss2Walk(state, r, playerLeft);  // $6E94
      return boss2Hop(state, r);                    // $6E97 -> $6FC4
    }
    // $6E9F: [$50,$70) and nothing else.
    if (!state.flow.bossRage) return boss2Walk(state, r, playerLeft);    // $6EA3
    r[E_FACING] = playerLeft ? 1 : 0;               // $6EA5-$6EAF: the throw
    if ((r[E_FLAGS] & 0x10) === 0) {                // $6EB1
      r[E_FLAGS] = (r[E_FLAGS] & ~0x20) | 0x10;     // $6EB7/$6EB9
      r[0x14] = 0x1F;                               // $6EBE
    }
    return fallTail(state, r);                      // $6EC4
  }
  // Close band, ad < $1F:
  if (ad < 8) return boss2MirrorPause(state, r);    // $6ED8
  if (absDiff8(playerScreenY(state), r[E_SCREEN_Y]) >= 0x20) {   // $6EE0-$6EEA
    if (r[E_FLAGS] & 0x03) return riseTail(state, r);     // $6EEE-$6EF5
    return boss2Walk(state, r, playerLeft);         // $6EF7 -> $6EC7
  }
  if (state.player.iframes !== 0) return boss2MirrorPause(state, r);   // $6EFF
  if (r[E_FLAGS] & 0x18) return riseTail(state, r);       // $6F09-$6F0C
  requestSound(state, 0x1C);                        // $6F10
  r[E_FLAGS] |= 0x08;                               // $6F16
  r[E_FACING] = playerLeft ? 1 : 0;                 // $6F1C-$6F24
  r[0x14] = 0x1F;                                   // $6F29
  r[E_FLAGS] &= ~0x20;                              // $6F2E
  return riseTail(state, r);                        // $6F30
}

/** ROM: loc_01_6EC7 - clear idle, walk toward the player. */
export function boss2Walk(state, r, playerLeft) {
  r[E_FLAGS] &= ~0x20;                              // $6ECB
  return playerLeft ? boss2WalkLeft(state, r) : boss2WalkRight(state, r);
}

/** ROM: loc_01_6F5C - dead zone: commit for $30 frames, facing the player's
 *  mirror ($FF88 XOR 1). Airborne it just runs the tails. */
export function boss2MirrorPause(state, r) {
  if (r[E_FLAGS] & 0x03) return riseTail(state, r);       // $6F5D-$6F63
  r[1] = (r[1] & 0xF3) | 0x10;                      // $6F6E-$6F72
  r[E_FACING] = state.player.facing ^ 1;            // $6F76
  r[0x15] = 0x30;                                   // $6F7F
  return riseTail(state, r);
}

/** ROM: loc_01_6F87/$6F8C - walker-idiom acceleration toward the +$1D cap. */
export function boss2WalkRight(state, r) {
  r[E_FACING] = 0;                                  // $6F8A
  let v = r[E_VX];
  if (v & 0x80) {                                   // $6F91 -> $6FEA
    v = u8(v + 2);
    r[E_VX] = v;
    return (v & 0x80) ? boss2MoveLeft(state, r, v) : boss2MoveRight(state, r, v);
  }
  const max = r[E_SPEED_CAP];                       // $6F98-$6FA4
  v = v + 1 < max ? v + 1 : max;
  r[E_VX] = v;
  return boss2MoveRight(state, r, v);
}

/** ROM: loc_01_6FF5/$6FFB - mirror. */
export function boss2WalkLeft(state, r) {
  r[E_FACING] = 1;                                  // $6FF8
  let v = r[E_VX];
  if (v !== 0 && (v & 0x80) === 0) {                // $7000-$7005
    v = u8(v - 2);                                  // $703D
    r[E_VX] = v;
    return (v & 0x80) ? boss2MoveLeft(state, r, v) : boss2MoveRight(state, r, v);
  }
  const min = u8(-r[E_SPEED_CAP]);                  // $7008-$701B
  v = u8(v - 1);
  if (v < min) v = min;
  r[E_VX] = v;
  return boss2MoveLeft(state, r, v);
}

/** ROM: loc_01_6FAC - a wall makes it JUMP (snap $80, vel 0, hop launcher);
 *  an open airborne step re-enters the band logic. */
export function boss2MoveRight(state, r, v) {
  addX(r, i8(v));
  if (probeRight(state, r) !== 0) {                 // $6FAF
    r[E_X_LO] = 0x80;                               // $6FB7
    r[E_VX] = 0;                                    // $6FBF
    return boss2Hop(state, r);                      // falls into $6FC4
  }
  return boss2AirRecheck(state, r);                 // $7048
}

/** ROM: loc_01_7023 - mirror (same $80 snap). */
export function boss2MoveLeft(state, r, v) {
  addX(r, i8(v));
  if (probeLeft(state, r) !== 0) {                  // $7026
    r[E_X_LO] = 0x80;                               // $702E
    r[E_VX] = 0;
    return boss2Hop(state, r);
  }
  return boss2AirRecheck(state, r);
}

/** ROM: loc_01_7048 - the airborne band re-entry. */
export function boss2AirRecheck(state, r) {
  if (r[E_FLAGS] & 0x03) return boss2Bands(state, r);     // $704C-$7052 -> $6E43
  return riseTail(state, r);                        // $7054
}

/** ROM: loc_01_6FC4 - boss 1's hop launcher with an 8-frame wind-up. */
export function boss2Hop(state, r) {
  r[E_FLAGS] &= ~0x18;                              // $6FC6/$6FC8
  if (r[E_FLAGS] & 0x01) return riseTail(state, r);       // $6FCA
  if (r[E_FLAGS] & 0x02) return fallTail(state, r);       // $6FCF
  r[1] |= 0x40;                                     // $6FD5
  boss1Aim(state, r);                               // $6FDC -> sub_01_79DB
  r[0x18] = 0x08;                                   // $6FE3
  return riseTail(state, r);
}

/**
 * ROM: jt_01_61DD - boss 2's attack tick. Every tick whose timer is not 7
 * probes, and a MISS queues a $28-frame COMMITTED walk for afterwards --
 * r[1] bit 4 plus the +$15 timer ($61FB adds $14 to HL at +1, so the store
 * at $6206 lands on +$15, NOT the attack timer; MEASURED on the cartridge:
 * the re-arm hook fires every missed frame while +$14 keeps counting 30, 29,
 * 28...). Timer 7 fires the mode-3 projectile if the ranged bit is up.
 * Falls through to the full handler like the others.
 */
export function attackTickBoss2(state, r) {
  if (r[0x14] === 0) {                              // $61E5 -> loc_01_6121
    state.flow.bossCrit = 0;
    r[E_FLAGS] &= 0xC7;
    return riseTail(state, r);
  }
  r[0x14]--;                                        // $61E8
  if (r[0x14] === 7) {                              // $61EA
    if (r[E_FLAGS] & 0x10) spawnProjectile(state, r, 3);  // $620E-$6219
  } else if (attackProbe(state, r) !== 0xFF) {      // $61F3-$61F9
    r[1] |= 0x10;                                   // $61FF
    r[0x15] = 0x28;                                 // $6206: +$15, see above
  }
  return stBoss2(state, r);                         // $6209 -> $6D8A
}

// ---------------------------------------------------------------------------
// State 13 -- boss 2's afterimages (slots 1/2).  ROM: jt_01_78A7.
//
// No physics at all: the record's +6/+7/+8 are written by stBoss2's history
// chain, and this handler only draws them -- slot flags bit 0 picks which
// PARITY of frames the image appears on, which is the flicker. Note the draw
// does NOT go through screenTail, so nothing here recomputes +7/+8.
// ---------------------------------------------------------------------------

export function stBoss2Part(state, r) {
  const odd = state.parity !== 0;                   // $FFA7
  if ((r[E_FLAGS] & 0x01) === 0 ? odd : !odd) return;     // $78A9-$78B8
  queueDraw(state, r[6], r, 0, false);              // $78BB-$78C6: sub_00_0BC6
}
