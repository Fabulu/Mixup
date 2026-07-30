// State 10 -- Boss 1 (level 4), and its attack tick.
//
// ROM range: jt_01_7591 with loc_01_767D/$76C5/$76AF/$7724 and sub_01_79DB,
// and jt_01_634F (the tick).
//
// THE PAIR MOVES TOGETHER, and this is the fall-through the whole
// one-file-per-unit rule was written for: attackTickBoss1 does not return
// after arming its probe, it runs off the end at $637C straight into
// jt_01_7591. An attacking boss 1 still executes its full distance logic on
// the same frame. Split the two across modules and the tick imports the
// handler while the driver imports the tick -- the exact shape this project
// has been bitten by repeatedly.
//
// sub_01_79DB (boss1Aim) LIVES HERE and is imported by bosses 2 and 4. Their
// hop launchers at $6FDC and $751E CALL it -- it is boss 1's aim routine that
// they borrow, not a shared utility that all three happen to use, and keeping
// it at its ROM home is what makes that borrowing visible.

import { u8, i8 } from '../../state.js';
import {
  E_FLAGS, E_FACING, E_SCREEN_X, E_SCREEN_Y,
  E_X_HI, E_X_LO, E_VX, E_HP, E_PROBE_DX,
} from '../record.js';
import {
  addX, absDiff8, playerScreenX, playerScreenY, requestSound,
} from '../util.js';
import { probeRight, probeLeft, attackProbe } from '../probe.js';
import { riseTail, fallTail } from '../tails.js';

// ---------------------------------------------------------------------------
// State 10 -- Boss 1 (level 4).  ROM: jt_01_7591.
//
// The whole fight is a hop-chase: on the ground the boss reads the player's
// cached screen X, picks a band, and either idles (far), hops toward the
// player (medium / dead-zone), or swings (8..$1B px). The hop is launched
// through the TURN-ANIMATION machinery -- loc_01_76C5 sets r[1] bit 6 with a
// $0F timer and animTick's expiry fires the actual jump -- which is why the
// grounded phase measures ~16 frames on the cartridge (flags $80 f0-f15,
// then $81 rising; hop launch f0/f96/f181/f277, rolls at f15/f111/f196/f292,
// all MEASURED on the 400-frame idle run).
// ---------------------------------------------------------------------------

export function stBoss1(state, r) {
  // $7597: below $10 HP on any non-easy difficulty the boss enrages -- the
  // far band stops idling and chases ($75FB reads it back).
  if (r[E_HP] < 0x10 && state.flow.difficulty !== 0) {
    state.flow.bossRage = 1;                        // $75A4: $C73D
  }
  if (r[E_FLAGS] & 0x07) {                          // $75A9-$75B3: stunned or
    const v = r[E_VX];                              // airborne -- move at +$12
    return (v & 0x80) ? boss1MoveLeft(state, r, v) : boss1MoveRight(state, r, v);
  }
  if (r[E_FLAGS] & 0x18) return riseTail(state, r);       // $75D1: mid-attack
  if (r[1] & 0x60) {                                // $75D8/$75DD: mid-anim
    r[E_FLAGS] &= ~0x20;                            // $7678: RES 5
    return riseTail(state, r);
  }

  const psx = playerScreenX(state);                 // $75E7 vs the cached +7
  const diff = u8(psx - r[E_SCREEN_X]);
  if (diff === 0) return boss1MirrorHop(state, r);  // $75EB -> $767D
  const playerLeft = psx < r[E_SCREEN_X];
  const ad = playerLeft ? u8(-diff) : diff;

  if (ad < 0x1C) {                                  // $75F2: close band
    if (ad < 8) return boss1MirrorHop(state, r);    // $7627: dead zone
    if (absDiff8(playerScreenY(state), r[E_SCREEN_Y]) >= 0x20) {   // $7636
      return boss1MirrorHop(state, r);
    }
    if (state.player.iframes !== 0) return boss1MirrorHop(state, r);  // $763A
    requestSound(state, 0x2B);                      // $7645
    r[E_FLAGS] |= 0x08;                             // $7648: melee attack
    r[E_FACING] = playerLeft ? 1 : 0;               // $7656
    r[0x14] = 0x1F;                                 // $765D
    r[E_FLAGS] &= ~0x20;                            // $7660: RES 5
    // $7662: the attack-crit roll, (rLY ^ $FFB1) < $70.
    //
    // APPROXIMATE, and do not let the constant fool you. rLY here is "how many
    // scanlines this frame's logic has burned" -- instruction-level timing, the
    // same thing that makes the $26D0 melee crit unmodellable (§28). An earlier
    // note claimed rLY read "EXACTLY 42 on both measured rolls" and treated it
    // as determinism; hooking 1:$7665 over 3000 frames of level 4 gives SEVEN
    // rolls at FOUR values -- 42, 42, 42, 53, 42, 39, 46.
    //
    // That matters more here than at $5ED8, because the compare is CP $70, not
    // CP $80: `< $70` means the high nibble of (rLY ^ $FFB1) must be <= 6, so
    // ALL FOUR high bits are load-bearing, not just bit 7. $2A is only right
    // while rLY lands in $20-$2F, and the $35 sample already left that band.
    //
    // The constant is kept because it reproduces all seven measured outcomes
    // and nothing better exists without a scanline counter -- but that is luck,
    // not correctness. If a scenario ever diverges HERE, this is why.
    state.flow.bossCrit = ((0x2A ^ state.frame) & 0xFF) < 0x70 ? 1 : 0;
    return riseTail(state, r);                      // $7674
  }
  if (ad < 0x60 || state.flow.bossRage) {           // $75F7 / $75FB: chase
    r[E_FACING] = playerLeft ? 1 : 0;               // $7619-$761F
    return boss1Hop(state, r);                      // $7624 -> $76C5
  }
  r[E_FACING] = playerLeft ? 1 : 0;                 // $7604-$760B: far -- idle
  r[E_FLAGS] |= 0x20;                               // $7610: SET 5
  return fallTail(state, r);                        // $7612 (vx NOT zeroed)
}

/** ROM: loc_01_767D - dead zone / same column: face the player's mirror
 *  (the walkerFacePause quirk again: $FF88 XOR 1, not relative position). */
export function boss1MirrorHop(state, r) {
  r[E_FACING] = state.player.facing ^ 1;            // $767F
  return boss1Hop(state, r);                        // $7687
}

/**
 * ROM: loc_01_76C5 - the hop launcher. Clears the attack bits; if already
 * airborne just runs the tails. Grounded it starts the turn animation as a
 * $0F-frame wind-up (animTick's expiry is what actually jumps, exactly like
 * the walkers' wall jump -- and on level 4 that expiry rolls the high-hop
 * crit, see animTick) and aims the horizontal velocity at the player.
 */
export function boss1Hop(state, r) {
  r[E_FLAGS] &= ~0x18;                              // $76C7/$76C9
  if (r[E_FLAGS] & 0x01) return riseTail(state, r);       // $76CB
  if (r[E_FLAGS] & 0x02) return fallTail(state, r);       // $76D0
  r[1] |= 0x40;                                     // $76D6: wind-up
  boss1Aim(state, r);                               // $76DD -> sub_01_79DB
  r[0x18] = 0x0F;                                   // $76E4: turn timer
  return riseTail(state, r);
}

/**
 * ROM: sub_01_79DB - hop aim: r[$12] = floor(|enemyX - playerX| / $4A),
 * negated when the player is left of (or exactly at) the enemy. The negate
 * here is the PROPER 16-bit one (ADD 1 with carry into the high byte), not
 * the neg16q idiom -- do not "fix" one to match the other.
 */
export function boss1Aim(state, r) {
  const ex = (r[E_X_HI] << 8) | r[E_X_LO];
  const sum = ex + ((0x10000 - (state.player.x & 0xFFFF)) & 0xFFFF);
  const carry = sum > 0xFFFF;                       // $79EF: ADD HL,BC
  let d = sum & 0xFFFF;
  if (!carry) d = (0x10000 - d) & 0xFFFF;           // $79F2: negate, E = 0
  let n = 0;
  while (d >= 0x4A) { d -= 0x4A; n++; }             // $7A05: repeated -$4A
  r[E_VX] = carry ? u8(-n) : u8(n);                 // $7A11-$7A17
}

/** ROM: loc_01_76AF - airborne rightward move. A wall snaps X-lo to centre
 *  and ZEROES the velocity (unlike the walkers), then re-enters the hop
 *  launcher -- which, still airborne, just routes to the tails. */
export function boss1MoveRight(state, r, v) {
  addX(r, i8(v));                                   // $76AF
  if (probeRight(state, r) !== 0) {                 // $76B2
    r[E_X_LO] = 0x80;                               // $76BA
    r[E_VX] = 0;                                    // $76BF
    return boss1Hop(state, r);                      // falls into $76C5
  }
  return riseTail(state, r);                        // $7749
}

/** ROM: loc_01_7724 - mirror. */
export function boss1MoveLeft(state, r, v) {
  addX(r, i8(v));
  if (probeLeft(state, r) !== 0) {                  // $7727
    r[E_X_LO] = 0x80;
    r[E_VX] = 0;
    return boss1Hop(state, r);
  }
  return riseTail(state, r);
}

/**
 * ROM: jt_01_634F - boss 1 holds the swing but only ARMS it late: the probe
 * runs on the last $0C frames of the $1F timer, and its reach depends on the
 * crit roll taken when the attack started ($C73F: offset $12 instead of $1A,
 * i.e. the crit punch lands CLOSER, not further). Unlike the basic tick this
 * one falls through into the full state handler ($637C -> jt_01_7591), so an
 * attacking boss still runs its distance logic every frame.
 */
export function attackTickBoss1(state, r) {
  if (r[0x14] === 0) {                              // $6357 -> loc_01_6121
    state.flow.bossCrit = 0;
    r[E_FLAGS] &= 0xC7;
    return riseTail(state, r);
  }
  r[0x14]--;                                        // $635A
  if (r[0x14] < 0x0C) {                             // $635C: last 12 frames
    r[E_PROBE_DX] = state.flow.bossCrit ? 0x12 : 0x1A;    // $636B / $636F
    attackProbe(state, r);                          // $6376
  }
  return stBoss1(state, r);                         // $637C
}
