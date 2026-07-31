// State 9 -- Boss 4, the Joker (level 14), and his attack tick.
//
// ROM range: jt_01_7288 with loc_01_73B1/$73ED/$74B0/$74CB/$74D0/$7537/$753D/
// $74F0/$7565/$7506, and jt_01_6300 (the tick).
//
// THE PAIR MOVES TOGETHER: the tick ends at `JP jt_01_7288`, the same
// fall-through bosses 1, 2 and 3 have.
//
// boss1Aim comes from bosses/boss1.js: $751E CALLS sub_01_79DB, exactly as
// boss 2's $6FDC does. Both hop launchers are boss 1's, borrowed.
//
// $C73D does double duty in this fight and the handler leans on it: it is the
// enrage latch for the other bosses, and here it is the phase counter --
// counted down through the stagger from $EF and then PARKED AT 1 for the rest
// of phase 2, which is what makes $7358's register clobber land in the hop arm
// rather than the throw. $C741 doubles as a per-band pose flag, which is safe
// only because level 14 has no $C741 special draw.

import { u8, i8 } from '../../state.js';
import {
  E_FLAGS, E_FACING, E_SCREEN_X, E_SCREEN_Y, E_X_LO, E_VX, E_HP, E_SPEED_CAP,
} from '../record.js';
import {
  addX, absDiff8, playerScreenX, playerScreenY, requestSound,
} from '../util.js';
import { probeRight, probeLeft, attackProbe } from '../probe.js';
import { riseTail, fallTail } from '../tails.js';
import { spawnProjectile } from '../states/projectile.js';
import { boss1Aim } from './boss1.js';

// ---------------------------------------------------------------------------
// State 9 -- Boss 4, the Joker (level 14).  ROM: jt_01_7288.
//
// Boss 2's walker skeleton with a two-PHASE fight driven by $C73D (the same
// byte the other bosses use as the enrage latch): phase 1 until HP < $18,
// then a one-shot stagger -- music stopped (sound 1 mask 4), pose forced
// idle, $C73D loaded as a ~$EF-frame countdown -- and at its end sound 6
// mask 3 (the phase-2 theme) with $C73D parked at 1 for the rest of the
// fight. Phase 2 throws (bit 4) from most bands and even mid-air whenever
// the PLAYER is airborne ($72EB reads $FF80). The walk rewrites its own
// speed cap by distance ($14 close, 6 far) and mirrors the L14 chaser
// through r[1] bit 7: latched, it walks AWAY, laughing every 16th frame
// (sound $2A). $C741 doubles as a per-band pose flag here (0/1), which is
// safe -- level 14 has no $C741 special draw.
// ---------------------------------------------------------------------------

export function stBoss4(state, r) {
  const f = state.flow;
  if (f.bossRage >= 2) {                            // $728D: mid-stagger
    const a = u8(f.bossRage - 1);                   // $72BB
    if (a !== 1) { f.bossRage = a; return riseTail(state, r); }   // $72C0
    f.bossRage = 1;                                 // $72C8: phase 2 begins
    requestSound(state, 0x06, 0x03);                // $72CB
    return boss4Throw(state, r, playerScreenX(state) < r[E_SCREEN_X]);   // $72D1
  }
  if (r[E_HP] < 0x18 && f.bossRage === 0) {         // $7296-$729E: the stagger
    requestSound(state, 0x01, 0x04);                // $72A0: stop the music
    r[E_FLAGS] = (r[E_FLAGS] & 0xE3) | 0x20;        // $72A9-$72AD
    r[0x14] = 0;                                    // $72B2
    // $72B6 stores $F0 and FALLS INTO $72BB, whose DEC runs the same frame.
    f.bossRage = 0xEF;
    return riseTail(state, r);
  }
  if (r[E_FLAGS] & 0x07) {                          // $72DF-$72E9
    // $72EB: phase 2, player airborne, own attack bits clear: throw NOW.
    if (f.bossRage === 1 && state.player.air !== 0 && (r[E_FLAGS] & 0x18) === 0) {
      return boss4Throw(state, r, playerScreenX(state) < r[E_SCREEN_X]);   // $72FC
    }
    const v = r[E_VX];                              // $7308
    return (v & 0x80) ? boss4MoveLeft(state, r, v) : boss4MoveRight(state, r, v);
  }
  if (r[E_FLAGS] & 0x18) return riseTail(state, r);       // $7324
  if (r[1] & 0x10) {                                // $732B: committed walk
    if (r[0x15] === 0) { r[1] &= ~0x10; return riseTail(state, r); }  // $74A5
    r[0x15]--;                                      // $7495
    return r[E_FACING] === 0 ? boss4WalkRightAccel(state, r) : boss4WalkLeftAccel(state, r);
  }
  if (r[1] & 0x60) {                                // $7330/$7335: mid-anim
    r[E_FLAGS] &= ~0x20;                            // $7488
    return riseTail(state, r);
  }

  const psx = playerScreenX(state);                 // $733E
  const diff = u8(psx - r[E_SCREEN_X]);
  if (diff === 0) return boss4MirrorPause(state, r);   // $7342 -> $74B0
  const playerLeft = psx < r[E_SCREEN_X];
  const ad = playerLeft ? u8(-diff) : diff;

  if (ad < 0x18) {                                  // $734A: close band
    if (ad < 8) return boss4MirrorPause(state, r);  // $7437-$743C
    if (absDiff8(playerScreenY(state), r[E_SCREEN_Y]) >= 0x20) {   // $7442-$7449
      return riseTail(state, r);                    // $744D (no walk!)
    }
    if (state.player.iframes !== 0) return boss4MirrorPause(state, r);  // $7453
    if (r[E_FLAGS] & 0x18) return riseTail(state, r);     // $745F
    requestSound(state, 0x1C);                      // $7464
    r[E_FLAGS] |= 0x08;                             // $746A
    r[E_FACING] = playerLeft ? 1 : 0;               // $7470-$7478
    r[0x14] = 0x1F;                                 // $747D
    r[E_FLAGS] &= ~0x20;                            // $7482
    return riseTail(state, r);
  }
  if (ad < 0x30) return boss4Walk(state, r, playerLeft, ad);   // $734F
  // $7354-$735C is the SAME clobber as boss 2's $6E6E-$6E76, and phase 2 has no
  // difficulty gate ($7296), so this is ordinary endgame play rather than a
  // hard-mode corner. $7358 replaces the distance in A with the $C73D byte --
  // which $72C8 parks at exactly 1 for the whole of phase 2 -- and $735C's
  // `JR NZ` enters the ladder at $7372 with it. `CP $40` therefore carries,
  // $7374's `JR NC` is not taken, $7376's rage test passes, and the far band
  // HOPS. MEASURED (boss4phase2.py): $7354 -> $735C -> $7372 -> $737D -> $7506
  // at ad = $61, with every throw arm ($7385/$73AB/$738D) 0x from this entry.
  let band = ad;
  if (ad >= 0x60) {
    if (!f.bossRage) {                              // $735C: JR NZ not taken
      r[E_FACING] = playerLeft ? 1 : 0;             // $735E-$7368: far idle
      r[E_FLAGS] |= 0x20;                           // $736D
      return fallTail(state, r);                    // $736F
    }
    band = u8(f.bossRage);                          // $7358: A := [$C73D]
  }
  if (band < 0x40) {                                // $7372: [$30,$40), or far
    if (!f.bossRage) return boss4Walk(state, r, playerLeft, ad);  // $7376
    return boss4Hop(state, r);                      // $737D -> $7506
  }
  if (band < 0x50) {                                // $7385: [$40,$50)
    if (f.bossRage) return boss4Throw(state, r, playerLeft);      // $73AB
    return boss4Walk(state, r, playerLeft, ad);
  }
  // $7389: [$50,$60) and nothing else.
  if (f.bossRage) return boss4Throw(state, r, playerLeft);        // $738D
  f.bossHop = 1;                                    // $738F: $C741
  r[E_FLAGS] &= 0xDF;                               // $7398-$739B
  if (playerLeft) {                                 // $739C: RETREAT at 6
    r[E_VX] = 0x06;                                 // $739F
    return boss4MoveRight(state, r, 0x06);          // $73A2 -> $74E9
  }
  r[E_VX] = 0xFA;                                   // $73A5
  return boss4MoveLeft(state, r, 0xFA);             // $73A8 -> $755E
}

/** ROM: loc_01_73B1 - the throw: face the player, roll the rLY crit exactly
 *  like boss 1's hop (measured reduction: crit <=> $FFB1 < $80), and hold
 *  the ranged pose $3F (crit, sound $29) or $1F frames. */
export function boss4Throw(state, r, playerLeft) {
  r[E_FACING] = playerLeft ? 1 : 0;                 // $73B3-$73BB
  if (state.frame < 0x80) state.flow.bossCrit = 1;  // $73BC-$73C8: rLY roll
  r[E_FLAGS] = (r[E_FLAGS] & ~0x20) | 0x10;         // $73CD/$73CF
  if (state.flow.bossCrit) {                        // $73D5
    requestSound(state, 0x29);                      // $73DB
    r[0x14] = 0x3F;                                 // $73E1
  } else {
    r[0x14] = 0x1F;                                 // $73E5
  }
  return riseTail(state, r);                        // $73EA
}

/** ROM: loc_01_73ED - walk toward (or away on the r[1] bit-7 latch), with
 *  the distance-dependent speed cap and the $C741 pose flag. */
export function boss4Walk(state, r, playerLeft, ad) {
  if (ad >= 0x30) { r[E_SPEED_CAP] = 0x06; state.flow.bossHop = 0; }  // $73F3-$73FF
  else { r[E_SPEED_CAP] = 0x14; state.flow.bossHop = 1; }      // $7401-$7408
  r[E_FLAGS] &= ~0x20;                              // $7411
  if (r[1] & 0x80) {                                // $7413-$741B: walk AWAY
    if ((state.frame & 0x0F) === 0) requestSound(state, 0x2A); // $741D-$7426
    return playerLeft ? boss4WalkRightAccel(state, r)          // $7429-$742D
      : boss4WalkLeftAccel(state, r);               // (facing NOT stored)
  }
  return playerLeft ? boss4WalkLeftStore(state, r)  // $7430-$7434
    : boss4WalkRightStore(state, r);
}

/** ROM: loc_01_74B0 - dead zone: commit $30 frames at the player's mirror. */
export function boss4MirrorPause(state, r) {
  r[1] = (r[1] & 0xF3) | 0x10;                      // $74B0-$74B6
  r[E_FACING] = state.player.facing ^ 1;            // $74BA
  r[0x15] = 0x30;                                   // $74C3
  return riseTail(state, r);
}

/** ROM: loc_01_74CB / loc_01_74D0 - walker-idiom acceleration. */
export function boss4WalkRightStore(state, r) {
  r[E_FACING] = 0;                                  // $74CB-$74CF
  return boss4WalkRightAccel(state, r);
}

export function boss4WalkRightAccel(state, r) {            // $74D0
  let v = r[E_VX];
  if (v & 0x80) {                                   // $74D5 -> $752C
    v = u8(v + 2);
    r[E_VX] = v;
    return (v & 0x80) ? boss4MoveLeft(state, r, v) : boss4MoveRight(state, r, v);
  }
  const max = r[E_SPEED_CAP];                       // $74DC-$74E8
  v = v + 1 < max ? v + 1 : max;
  r[E_VX] = v;
  return boss4MoveRight(state, r, v);
}

/** ROM: loc_01_7537 / loc_01_753D - mirror. */
export function boss4WalkLeftStore(state, r) {
  r[E_FACING] = 1;                                  // $7537-$753C
  return boss4WalkLeftAccel(state, r);
}

export function boss4WalkLeftAccel(state, r) {             // $753D
  let v = r[E_VX];
  if (v !== 0 && (v & 0x80) === 0) {                // $7541-$7547 -> $757E
    v = u8(v - 2);
    r[E_VX] = v;
    return (v & 0x80) ? boss4MoveLeft(state, r, v) : boss4MoveRight(state, r, v);
  }
  const min = u8(-r[E_SPEED_CAP]);                  // $754A-$755D
  v = u8(v - 1);
  if (v < min) v = min;
  r[E_VX] = v;
  return boss4MoveLeft(state, r, v);
}

/** ROM: loc_01_74F0 - a wall makes it jump (snap $80, hop launcher). */
export function boss4MoveRight(state, r, v) {
  addX(r, i8(v));
  if (probeRight(state, r) !== 0) {                 // $74F3
    r[E_X_LO] = 0x80;                               // $74FB
    r[E_VX] = 0;                                    // $7500
    return boss4Hop(state, r);                      // falls into $7506
  }
  return riseTail(state, r);                        // $758A
}

/** ROM: loc_01_7565 - mirror. */
export function boss4MoveLeft(state, r, v) {
  addX(r, i8(v));
  if (probeLeft(state, r) !== 0) {                  // $7568
    r[E_X_LO] = 0x80;                               // $7570
    r[E_VX] = 0;
    return boss4Hop(state, r);
  }
  return riseTail(state, r);
}

/** ROM: loc_01_7506 - boss 2's hop launcher shape, 8-frame wind-up. */
export function boss4Hop(state, r) {
  r[E_FLAGS] &= ~0x18;                              // $7508/$750A
  if (r[E_FLAGS] & 0x01) return riseTail(state, r);       // $750C
  if (r[E_FLAGS] & 0x02) return fallTail(state, r);       // $7511
  r[1] |= 0x40;                                     // $7517
  boss1Aim(state, r);                               // $751E -> sub_01_79DB
  r[0x18] = 0x08;                                   // $7525
  return riseTail(state, r);
}

/**
 * ROM: jt_01_6300 - boss 4's attack tick: boss 2's shape, except the timer-7
 * projectile (the thrown mode-5 bomb) fires only on a NON-crit throw
 * ($6330 tests $C73F first), and the crit throw's damage comes from the
 * probes alone.
 */
export function attackTickBoss4(state, r) {
  if (r[0x14] === 0) {                              // $6308 -> loc_01_6121
    state.flow.bossCrit = 0;
    r[E_FLAGS] &= 0xC7;
    return riseTail(state, r);
  }
  r[0x14]--;                                        // $630B
  if (r[0x14] === 7) {                              // $630D
    if (!state.flow.bossCrit && (r[E_FLAGS] & 0x10)) {    // $6330-$633A
      spawnProjectile(state, r, 5);                 // $633E-$6343
    }
  } else if (attackProbe(state, r) !== 0xFF) {      // $6316-$631C
    r[1] |= 0x10;                                   // $6323
    r[0x15] = 0x28;                                 // $632A: +$15 -- HL sits
  }                                                 // at +1 before the +$14
  return stBoss4(state, r);                         // add, exactly like
}                                                   // boss 2's $6206
