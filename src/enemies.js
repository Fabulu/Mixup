// Enemy array -- $C268.  ROM: driver sub_01_4E0C, dispatch 1:$50D3.
//
// 8 slots x 32 bytes, preloaded whole at level init from a bank-5 blob that is
// a byte-identical image of the RAM records. There is no streaming spawner and
// no pooling: the whole roster for a level exists from the moment it loads,
// dormant until the camera comes near. The entire game ships 26 non-boss
// enemies and 5 boss entities. The only runtime spawn is the projectile copy
// into slots 6/7 (sub_01_6BDC).
//
// Record layout (master reference §5.2, refined against the handlers):
//   +0        flags: b7 active, b6 permanently disabled, b5 idle (player far),
//             b4 ranged attack, b3 melee attack, b2 hit-flash/stun,
//             b1 falling, b0 rising
//   +1        sub-flags: b7 wall-jump latch, b6 turn animation, b5 landing
//             animation, b4 committed walk, b1 slow-fall (terminal -8)
//   +2        STATE = the enemy type, 1-13 -> dispatch 1:$50D3
//   +3        walk anim: period<<4 | subtimer (flyer reuses it as flap speed)
//   +4        walk anim: (frames-1)<<4 | frame
//   +5        facing (b0; also knockback direction)
//   +6        current metasprite id (projectiles: template variant 1-5)
//   +7/+8     screen X / Y, recomputed by loc_01_5CA8 each frame
//   +9        OAM attr ($80 = behind BG; water). Cleared by the driver.
//   +$0A-$0D  hitbox: halfW right / halfW left / halfH up / halfH down
//   +$0E/+$0F X world 12.4        +$10/+$11  Y world 12.4
//   +$12      X velocity (signed) +$13       Y velocity (positive = up)
//   +$14      attack timer        +$15       committed-walk timer
//   +$16      HP                  +$17       hit-flash / stun timer ($3C)
//   +$18/+$19 turn / landing animation timers
//   +$1A      ceiling-snap Y-lo   +$1B       conveyor-snap Y-lo
//   +$1C      jump velocity       +$1D       walk speed cap
//   +$1E/+$1F attack-probe offset X (facing-signed) / Y (signed), in px

import { u8, i8, u16, mapCollisionByIndex } from './state.js';
import { drawMetasprite } from './render/metasprite.js';

export const SLOTS = 8;
export const RECORD = 32;

const F_ACTIVE = 0x80, F_DISABLED = 0x40;

/** Camera-relative windows. ROM: $60A9 (activate), sub_00_11A7 (despawn). */
const ACTIVATE_RANGE = 7;
const DESPAWN_RANGE = 9;
const DEATH_ROW = 0x21;

/**
 * State handlers at 1:$50D3 not yet ported. 1-3 cover every non-boss enemy
 * outside the boss levels; 11/12 are the projectile and the dormant shell the
 * ported states spawn into / wake from.
 *
 *   4 $7750 L14 chaser          8 $7061 BOSS 3 (L11)
 *   5 $575C L6 vehicle target   9 $7288 BOSS 4 Joker (L14)
 *   6 $57D6 L12 enemy          10 $7591 BOSS 1 (L4)
 *   7 $6D8A BOSS 2 (L8)        13 $78A7 boss-2 parts
 */
export const UNIMPLEMENTED_STATES = new Set([4, 5, 6, 7, 8, 9, 10, 13]);

const hexBytes = (s) => Uint8Array.from(s.match(/.{2}/g), (b) => parseInt(b, 16));

/**
 * Player melee lands on an enemy.  ROM: loc_00_2643-$272B, the punch probe's
 * ($C72B = 5) enemy scan -- reached from sub_00_20BA only when the probe row
 * is above $20 and the map cell at the probe point is empty or water.
 *
 * The whole test is in SCREEN space, like the map-object scan next door: the
 * probe point goes through sub_00_1172 at $2430 and is compared against each
 * slot's CACHED screen bytes at +7/+8 -- which were written by loc_01_5CA8 at
 * the end of LAST frame's enemy driver, one frame stale by design. The box is
 * the ENEMY's, not the player's: half-width r[+$0B] MINUS ONE ($2685 DEC A,
 * strict <), half-height r[+$0C] (strict <). A failed X test retries once with
 * the probe pulled 8 px back toward the player ($269B/$26A0 -- facing right
 * SUBTRACTS, facing left ADDS), which widens the window on the NEAR side only.
 *
 * Work the geometry through, because the direction is easy to state backwards:
 * the fist is 14 px ahead of the player ($201F loads +$00E0), and the union of
 * the two tests covers probe-14 through probe+6. So facing right the window
 * runs from the player's OWN CENTRE to about 20 px ahead of him -- generous
 * behind the fist, and barely reaching past it.
 *
 * MEASURED on the cartridge (level 3, slot-3 walker, box bytes 7/15): probe
 * screen 102 vs enemy 100 hits; probe 102 vs enemy 86 misses on both the first
 * test and the retry at 94. With the player's centre at 88, that enemy was 2 px
 * behind HIM, not behind the fist. The short forward reach is why "level-3
 * enemies cannot be punched first" was reported: you have to let them come
 * most of the way in before the window covers them at all.
 *
 * Only the FIRST overlapping slot is hit -- $271F returns $FF immediately.
 * States 4/$0B/$0D are transparent to the fist ($2667-$2673). $C740 must be
 * $FF, which holds everywhere except level 14's boss mode ($0DE3 writes 1).
 *
 * Two outcomes. Normally 2 damage plus a $3C stun and the hit-flash bit. But
 * if `(rLY ^ $FFB1) < 8` it is a CRIT: sound $18 instead of $21 and the
 * enemy's ENTIRE remaining HP as damage. Non-boss levels only ($26D7).
 *
 * THE CRIT WINDOW CANNOT BE BIT-EXACT. $26D0 reads the live scanline counter
 * mid-frame: measured under PyBoy, the one connecting punch in the level-3
 * scenario read rLY = 44 -- not a VBlank value, but "how many scanlines this
 * frame's logic had consumed when the scan ran", i.e. instruction-level
 * timing, out of scope by definition (docs/03-VERIFICATION.md par.28). The
 * port keeps the feature with a modelled rLY; it is pseudo-random at the
 * cartridge's ~3% rate but will never agree with it punch for punch. If an
 * oracle scenario ever trips it, widen the scenario, don't chase the model.
 *
 * @param probeX/probeY  the punch probe point in world 12.4 ($FFB6-$FFB9)
 * @returns 0xFF on a hit (the probe's own return value), else 0
 */
export function meleeHitTest(state, probeX, probeY) {
  const p = state.player;
  const t = state.tunables;

  // $2430 / sub_00_1172: world -> screen, same formula as screenTail below.
  const probeSX = u8((u16(probeX - state.camera.x) >> 4) + 8);
  const probeSY = u8((u16((probeY & 0x0FFF) - state.camera.y) >> 4) + 0x10);

  for (let slot = 0; slot < SLOTS; slot++) {
    const r = state.enemies[slot];
    if ((r[0] & F_ACTIVE) === 0) continue;          // $2660
    const st = r[2];
    if (st === 0x0D || st === 0x0B || st === 0x04) continue;   // $2667-$2673

    const halfW = u8(r[0x0B] - 1);                  // $2685: DEC A
    const halfH = r[0x0C];

    // --- X ($268D): strict <, then one retry 8 px back toward the player.
    if (absDiff8(r[7], probeSX) >= halfW) {
      const back = u8(p.facing === 0 ? probeSX - 8 : probeSX + 8);  // $269B/$26A0
      if (absDiff8(r[7], back) >= halfW) continue;  // $26AA
    }
    // --- Y ($26AD): strict <, no retry.
    if (absDiff8(r[8], probeSY) >= halfH) continue; // $26B3

    // $26B7: $C750, not $C740. Identical today -- $0DC5/$0DCA set both per level and
    // $0DE0/$0DE3 override both on level $0E -- but they part after a boss
    // dies: 1:$4EF1 writes $C740 = $FE, which permanently disables ALL melee
    // and batarang damage while $C750 stays 0. Revisit when bosses land.
    if (state.flow.bossMode) continue;

    requestSound(state, 0x19);                      // $26BE
    r[0] |= 0x04;                                   // $26C4: hit-flash
    r[0x17] = t.enemyStunFrames;                    // $26CA: $3C

    // $26CD: the crit window -- rLY is MODELLED, see the header comment.
    const ly = (state.frame * 7) & 0x7F;
    const crit = ((ly ^ state.frame) & 0xFF) < t.critWindow
                 && state.level.bossId === 0;       // $26D7: $C73E == 0

    const dmg = crit ? r[0x16] : t.meleeDamage;     // $26E3 vs $26F0
    r[0x16] = Math.max(0, r[0x16] - dmg);           // $26F6: SUB, clamp 0
    requestSound(state, crit ? 0x18 : 0x21);
    // $2708-$271B: the hit-spark effect ($C744-$C747 + sub_00_0CC2) is not
    // modelled -- same stance as the $4E84 death explosion.
    return 0xFF;                                    // $271F: first hit only
  }
  return 0;                                         // $272A
}

export function createEnemies() {
  return Array.from({ length: SLOTS }, () => new Uint8Array(RECORD));
}

/** ROM: sub_00_2889 block-copies count x 32 B straight into $C268. */
export function loadEnemies(state, records, count) {
  for (let i = 0; i < SLOTS; i++) {
    state.enemies[i].fill(0);
    if (i < count) state.enemies[i].set(records.subarray(i * RECORD, (i + 1) * RECORD));
  }
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

/**
 * ROM: sub_01_4E0C.
 *
 * The loop direction alternates with frame parity ($FFA7): even frames walk
 * slots 0->7, odd frames 7->0. That is not cosmetic -- it decides which enemy
 * wins when two would act on the same thing in one frame, and whether a
 * projectile spawned into slot 6 acts on its spawn frame or the next.
 */
export function updateEnemies(state) {
  if (!state.enemyDraws) state.enemyDraws = [];
  state.enemyDraws.length = 0;
  if (state.flow.bossMode) return;                  // $4E0C: $C750 -> 1:$77BD

  const descending = state.parity !== 0;            // $4E13
  for (let n = 0; n < SLOTS; n++) {
    const slot = descending ? SLOTS - 1 - n : n;
    state.enemyCursor = slot;                       // $FFB3
    const r = state.enemies[slot];

    if ((r[0] & F_ACTIVE) === 0) { tryActivate(state, r); continue; }   // $4E27
    if (state.flow.paused || state.lagFrame) {      // $4E2C / $4E39
      screenTail(state, r);                         // -> loc_01_5CA8 directly
      continue;
    }

    if (shouldDespawn(state, r)) {                  // $4E4D -> sub_00_11A7
      r[0] &= ~F_ACTIVE;                            // $4E55: RES 7 only
      continue;
    }

    r[9] = 0;                                       // $4E60: attr rebuilt per frame
    if (r[0x10] >= DEATH_ROW) { kill(state, r); continue; }   // $4E69: fell out
    if (r[0x16] === 0) {                            // $4E75: HP gone
      // $4E84: on non-boss levels the death also spawns the explosion effect
      // ($C744-$C74C + sub_00_0CC2/0CF3). The effect pool is not modelled.
      kill(state, r);
      continue;
    }

    // loc_01_4F0E: hit-state prelude before the type dispatch.
    if (r[0] & F_DISABLED) { kill(state, r); continue; }      // $4F11: BIT 6
    if (r[0] & 0x04) { stunnedTick(state, r); continue; }     // $4F15: BIT 2
    if (r[0] & 0x18) { hitDispatch(state, r); continue; }     // $4F19 -> $60DD
    primaryDispatch(state, r);                                // $4F1E -> $50C3
  }
}

/**
 * ROM: loc_01_6094.
 *
 * Activation is a pure camera-distance test on the HIGH bytes, with two
 * gates: bit 6 marks an enemy permanently dead, and a subtype of 1 additionally
 * demands the camera land on an exact column, so those spawn on a precise
 * scroll position rather than anywhere in the window.
 */
function tryActivate(state, r) {
  const xhi = r[0x0E];
  if (xhi === 0) return;                            // $609B

  const camCol = u8((state.camera.x >> 8) + 5);     // $60A0
  if (absDiff8(camCol, xhi) >= ACTIVATE_RANGE) return;    // $60A9
  if (r[0] & F_DISABLED) return;                    // $60AF: BIT 6
  if (r[1] === 0x01) {                              // $60B5
    // $60BC: only when the enemy's column equals camera - 2, exactly.
    if (xhi !== u8((state.camera.x >> 8) - 2)) return;
  }
  r[0] |= F_ACTIVE;                                 // $60C5: SET 7
}

/**
 * ROM: sub_00_11A7 - the despawn window is wider than the activation one, and
 * tests ONLY the X distance; falling out of the world is the driver's separate
 * $4E69 check (which disables permanently, where this one merely deactivates).
 */
function shouldDespawn(state, r) {
  const camCol = u8((state.camera.x >> 8) + 5);
  return absDiff8(camCol, r[0x0E]) >= DESPAWN_RANGE;
}

/** ROM: loc_01_4EB8 - keep bits 6, 1, 0; drop active/attack/idle; latch dead. */
function kill(state, r) {
  r[0] = (r[0] & 0x43) | F_DISABLED;
}

/** ROM: loc_01_50C3, table 1:$50D3, indexed on state-1. */
function primaryDispatch(state, r) {
  switch (r[2]) {
    case 1: return stWalker(state, r);              // 1:$50ED
    case 2: return stWalkerJump(state, r);          // 1:$5399
    case 3: return stFlyer(state, r);               // 1:$55AA
    case 0x0B: return stProjectile(state, r);       // 1:$59E0
    case 0x0C: return stDormant(state, r);          // 1:$5B95
    // NOTE: no screenTail here, so an enemy in one of the unported states
    // keeps STALE +7/+8 screen bytes indefinitely -- and both hit scans now
    // compare against exactly those. The old world-space tests were immune to
    // this. Latent (boss levels only) until states 4-10/13 land.
    default: return;                                // see UNIMPLEMENTED_STATES
  }
}

// ---------------------------------------------------------------------------
// Hit reaction: stun countdown and the secondary dispatch
// ---------------------------------------------------------------------------

/**
 * ROM: loc_01_4F21. Runs instead of the type dispatch while bit 2 (hit-flash)
 * is set. The stun timer starts at $3C; the two frames at $3B/$3A BOTH re-arm
 * the knockback (the CP $3A gate is >=, not ==), after which the enemy runs
 * its normal handler while blinking until the timer expires.
 */
function stunnedTick(state, r) {
  if (r[0x17] === 0) return stunExpired(state, r);  // $4F27
  const t = u8(r[0x17] - 1);
  r[0x17] = t;
  if (t < 0x3A) {                                   // $4F2E -> loc_01_503D
    if (r[0] & 0x18) return hitDispatch(state, r);
    return primaryDispatch(state, r);
  }
  const st = r[2];                                  // $4F35
  if (st === 5) {                                   // $4F7C: vehicle target
    r[0] &= 0xC5;
    return primaryDispatch(state, r);
  }
  if (st === 7 || st === 9 || st === 0x0A) return bossKnockback(state, r); // $4F84
  if (st === 8) return boss3Knockback(state, r);    // $4FF5
  // $4F4B: walkers / flyers / projectiles bounce up and away from the player.
  r[0x13] = 0x18;
  r[0x12] = playerScreenX(state) >= r[7] ? 0xF0 : 0x10;   // $4F59
  r[0] = (r[0] & 0xC5) | 0x01;                      // $4F6A: rising
  r[1] &= 0x9F;                                     // $4F70
  // $4F76: $C73F (boss-3 helper flag) = 0 -- not modelled.
  return primaryDispatch(state, r);
}

/** ROM: loc_01_4F84 - bosses 2/4/L14-chaser knockback (+ hard-mode counter). */
function bossKnockback(state, r) {
  r[0x13] = 0x10;
  const xhi = r[0x0E];                              // $4F91: arena walls
  if (xhi === 0x0A) r[0x12] = 0xF0;
  else if (xhi === 0x01) r[0x12] = 0x10;
  else r[0x12] = playerScreenX(state) >= r[7] ? 0xF0 : 0x10;
  r[0] = (r[0] & 0xC5) | 0x01;
  r[1] &= 0x9F;
  // $4FCA: $C741 = 0 -- boss crit flag, not modelled.
  if (state.flow.difficulty === 2) {                // $4FCD: retaliate on hard
    r[0] |= 0x08;
    r[5] = playerScreenX(state) < r[7] ? 1 : 0;     // $4FDE
    r[0x14] = 0x1F;                                 // $4FED
  }
  return primaryDispatch(state, r);
}

/** ROM: loc_01_4FF5 - boss 3 variant (X hi >= 9 counts as the right wall). */
function boss3Knockback(state, r) {
  r[0x13] = 0x10;
  const xhi = r[0x0E];
  if (xhi >= 0x09) r[0x12] = 0xF0;                  // $5003
  else if (xhi === 0x01) r[0x12] = 0x10;
  else r[0x12] = playerScreenX(state) >= r[7] ? 0xF0 : 0x10;
  r[0] = (r[0] & 0xC5) | 0x01;
  r[1] &= 0x9F;
  return primaryDispatch(state, r);
}

/** ROM: loc_01_5049 - the stun timer just expired. */
function stunExpired(state, r) {
  const bid = state.level.bossId;                   // $C73E
  if (bid === 2 || bid === 4) {                     // $505A
    r[5] = playerScreenX(state) < r[7] ? 1 : 0;
    r[0] = (r[0] & 0xC3) | 0x10;
    r[0x14] = 0x1F;
    return riseTail(state, r);
  }
  if (bid === 3) {                                  // $5080
    r[0x14] = 0x1F;
    r[5] = playerScreenX(state) < r[7] ? 1 : 0;     // $508E (SUB-based, same test)
    r[0x12] = (r[5] & 1) ? 0xCC : 0x34;             // $50A1
    r[0] = (r[0] & 0xC3) | 0x08;
    // $50B0: $C73F = 1 -- not modelled.
    requestSound(state, 0x2D);
    return primaryDispatch(state, r);               // $50BB
  }
  r[0] &= ~0x04;                                    // $50C1
  return primaryDispatch(state, r);
}

/** ROM: loc_01_60DD, table 1:$60EF -- runs while bits 3/4 (attack) are set. */
function hitDispatch(state, r) {
  switch (r[2]) {
    case 1: case 4: case 0x0B: return attackTickBasic(state, r);   // jt_01_6107
    case 2: return attackTickWalkerJump(state, r);                 // jt_01_612E
    case 3: return attackTickFlyer(state, r);                      // jt_01_6169
    case 6: return attackTickL12(state, r);                        // jt_01_61B3
    case 0x0C: return attackTickDormant(state, r);                 // jt_01_637F
    default: return;   // 5 -> $6398, 7-10 boss variants: unported
  }
}

/** ROM: jt_01_6107 - hold the attack pose, probing the player every frame. */
function attackTickBasic(state, r) {
  if (r[0x14] !== 0) {
    r[0x14]--;
    attackProbe(state, r);                          // $6118 -> sub_01_6616
    return riseTail(state, r);
  }
  // $6121: $C73F = 0 -- not modelled.
  r[0] &= 0xC7;
  return riseTail(state, r);
}

/** ROM: jt_01_612E - state 2 turns AWAY after the lunge and commits to it. */
function attackTickWalkerJump(state, r) {
  if (r[0x14] !== 0) {
    r[0x14]--;
    attackProbe(state, r);
    return riseTail(state, r);
  }
  r[0] &= 0xC7;                                     // $6148
  r[1] = (r[1] & 0xF3) | 0x10;                      // committed walk
  r[5] ^= 1;                                        // $615A
  r[0x15] = 0x18;                                   // $6161
  return riseTail(state, r);
}

/** ROM: jt_01_6169 - flyer dive/knockback: X speed decays 1/frame toward 0. */
function attackTickFlyer(state, r) {
  const v = u8((r[5] & 1) === 0 ? r[0x12] - 1 : r[0x12] + 1);   // $6177 / $618E
  if (v === 0) {                                    // $61A1: recovered
    r[0] &= 0xC7;
    r[3] = 0x50;
    return riseTail(state, r);
  }
  r[0x12] = v;
  return (v & 0x80) ? flyMoveLeft(state, r, v) : flyMoveRight(state, r, v);
}

/** ROM: jt_01_61B3 - state 6 pause after its attack. */
function attackTickL12(state, r) {
  if (r[0x14] !== 0) { r[0x14]--; return riseTail(state, r); }
  r[0] &= 0xC7;
  r[1] = (r[1] & 0xF3) | 0x10;
  r[0x15] = 0x28;                                   // $61D5
  return riseTail(state, r);
}

/** ROM: jt_01_637F - state 12 counts its timer down, then wakes. */
function attackTickDormant(state, r) {
  if (r[0x14] !== 0) { r[0x14]--; return screenTail(state, r); }
  r[0] &= 0xE7;                                     // $6392
  return stDormant(state, r);
}

// ---------------------------------------------------------------------------
// State 1 -- walker (levels 1-3).  ROM: jt_01_50ED.
// ---------------------------------------------------------------------------

function stWalker(state, r) {
  if (r[0] & 0x03) return walkerAirMove(state, r);  // $50EF: airborne
  const f1 = r[1];                                  // $5113
  if (f1 & 0x60) {                                  // $5114: turn/landing anim
    r[0] &= ~0x20;                                  // $51B4
    return walkerAirMove(state, r);                 // move at r[$12] regardless
  }
  if (f1 & 0x10) {                                  // $511E: committed walk
    if (r[0x15] === 0) { r[1] &= ~0x10; return riseTail(state, r); }  // $51D0
    r[0x15]--;                                      // $51C0
    return r[5] === 0 ? walkerWalkRight(state, r) : walkerWalkLeft(state, r);
  }

  const psx = playerScreenX(state);                 // $FF93
  const diff = u8(psx - r[7]);                      // $5128: vs the STORED screen X
  if (diff === 0) return walkerFacePause(state, r); // $512B
  const playerLeft = psx < r[7];
  const ad = playerLeft ? u8(-diff) : diff;

  if (ad < 0x14) {                                  // $5133
    if (ad < 8) return walkerFacePause(state, r);   // $516E: too close
    if (absDiff8(playerScreenY(state), r[8]) >= 0x18) {   // $5180
      return walkerWalkToward(state, r, playerLeft);
    }
    if (state.player.iframes !== 0) return walkerFacePause(state, r);  // $5184
    requestSound(state, 0x1A);                      // $518F: melee attack
    r[0] |= 0x08;                                   // $5195
    r[5] = playerLeft ? 1 : 0;                      // $519C
    r[0x14] = 0x13;                                 // $51A8
    r[0] &= ~0x20;
    return fallTail(state, r);
  }
  if (ad < 0x30) return walkerWalkToward(state, r, playerLeft);   // $5137
  if (absDiff8(playerScreenY(state), r[8]) < 0x30) {              // $5145
    return walkerWalkToward(state, r, playerLeft);
  }
  r[0] |= 0x20;                                     // $514E: idle, player far
  r[0x12] = 0;
  return fallTail(state, r);
}

/** ROM: loc_01_515D */
function walkerWalkToward(state, r, playerLeft) {
  r[0] &= ~0x20;
  return playerLeft ? walkerWalkLeft(state, r) : walkerWalkRight(state, r);
}

/**
 * ROM: loc_01_51DB. Directly under/over the player (or in the dead zone): stop
 * and commit for $20 frames. Quirk: the facing MIRRORS THE PLAYER'S ($FF88
 * XOR 1) rather than being computed from relative position.
 */
function walkerFacePause(state, r) {
  r[1] = (r[1] & 0xF3) | 0x10;
  r[5] = state.player.facing ^ 1;                   // $51E5
  r[0x15] = 0x20;
  return riseTail(state, r);
}

/** ROM: loc_01_51F6 - accelerate right by 1/frame toward the +$1D cap. */
function walkerWalkRight(state, r) {
  r[5] = 0;                                         // $51F9
  let v = r[0x12];
  if (v & 0x80) {                                   // $5200: still moving left
    v = u8(v + 2);                                  // $52F0: brake by 2
    r[0x12] = v;
    return (v & 0x80) ? walkerMoveLeft(state, r, v, wallStopWalker)
      : walkerMoveRight(state, r, v, wallStopWalker);
  }
  const max = r[0x1D];                              // $520B
  v = v + 1 < max ? v + 1 : max;
  r[0x12] = v;
  return walkerMoveRight(state, r, v, wallStopWalker);
}

/** ROM: loc_01_52FB - mirror. */
function walkerWalkLeft(state, r) {
  r[5] = 1;                                         // $52FE
  let v = r[0x12];
  if (v !== 0 && (v & 0x80) === 0) {                // $5306/$5309: moving right
    v = u8(v - 2);                                  // $538D
    r[0x12] = v;
    return (v & 0x80) ? walkerMoveLeft(state, r, v, wallStopWalker)
      : walkerMoveRight(state, r, v, wallStopWalker);
  }
  const min = u8(-r[0x1D]);                         // $5315
  v = u8(v - 1);
  if (v < min) v = min;                             // $531D: unsigned clamp
  r[0x12] = v;
  return walkerMoveLeft(state, r, v, wallStopWalker);
}

/** ROM: loc_01_50F7 - airborne (or mid-anim): move at r[$12], sign-split. */
function walkerAirMove(state, r) {
  const v = r[0x12];
  return (v & 0x80) ? walkerMoveLeft(state, r, v, wallStopWalker)
    : walkerMoveRight(state, r, v, wallStopWalker);
}

// ---------------------------------------------------------------------------
// State 2 -- walker+jump (levels 5, 7, 13).  ROM: jt_01_5399.
// ---------------------------------------------------------------------------

function stWalkerJump(state, r) {
  if (r[0] & 0x03) return wjAirMove(state, r);      // $539B
  const f1 = r[1];
  if (f1 & 0x60) {                                  // $53C0
    r[0] &= ~0x20;                                  // $5484
    return wjAirMove(state, r);
  }
  if (f1 & 0x10) {                                  // $53CA: committed walk
    if (r[0x15] === 0) { r[1] &= ~0x10; return riseTail(state, r); }  // $54A1
    r[0x15]--;
    return r[5] === 0 ? wjWalkRight(state, r) : wjWalkLeft(state, r);
  }

  const psx = playerScreenX(state);
  const diff = u8(psx - r[7]);                      // $53D4
  if (diff === 0) return wjPause(state, r);         // $53D7
  const playerLeft = psx < r[7];
  const ad = playerLeft ? u8(-diff) : diff;

  if (ad < 0x18) {                                  // $53DF
    if (ad < 8) return wjPause(state, r);           // $5448
    if (absDiff8(playerScreenY(state), r[8]) >= 0x20) {   // $545A
      return wjWalkToward(state, r, playerLeft);
    }
    requestSound(state, 0x1C);                      // $5460: melee lunge
    r[0] |= 0x08;                                   // $5466
    r[5] = playerLeft ? 1 : 0;                      // $546D
    r[0x14] = 0x1F;                                 // $5479
    r[0] &= ~0x20;
    return fallTail(state, r);
  }
  if (ad < 0x30) return wjWalkToward(state, r, playerLeft);   // $53E3
  // Far band:
  if (playerScreenY(state) === r[8]) {              // $53EC: EXACT row match
    r[5] = playerLeft ? 1 : 0;                      // $540F
    if (spawnProjectile(state, r, 1) === 0) {       // $541E: sub_01_6BDC mode 1
      r[0] = (r[0] & ~0x20) | 0x10;                 // $5427: ranged attack
      r[0x14] = 0x0F;                               // $542F
    }
    return fallTail(state, r);
  }
  r[5] = playerLeft ? 1 : 0;                        // $53F1: idle facing player
  r[0] |= 0x20;                                     // $53FE
  r[0x12] = 0;
  return fallTail(state, r);
}

/** ROM: loc_01_54AC - commit to the current facing for $28 frames (no turn). */
function wjPause(state, r) {
  r[1] = (r[1] & 0xF3) | 0x10;
  r[0x15] = 0x28;                                   // $54B8
  return riseTail(state, r);
}

/** ROM: loc_01_5437 */
function wjWalkToward(state, r, playerLeft) {
  r[0] &= ~0x20;
  return playerLeft ? wjWalkLeft(state, r) : wjWalkRight(state, r);
}

/** ROM: loc_01_54C0 - identical accel to state 1, different wall behaviour. */
function wjWalkRight(state, r) {
  r[5] = 0;
  let v = r[0x12];
  if (v & 0x80) {
    v = u8(v + 2);                                  // $5554
    r[0x12] = v;
    return (v & 0x80) ? walkerMoveLeft(state, r, v, wallStopWalkerJump)
      : walkerMoveRight(state, r, v, wallStopWalkerJump);
  }
  const max = r[0x1D];
  v = v + 1 < max ? v + 1 : max;
  r[0x12] = v;
  return walkerMoveRight(state, r, v, wallStopWalkerJump);
}

/** ROM: loc_01_555F */
function wjWalkLeft(state, r) {
  r[5] = 1;
  let v = r[0x12];
  if (v !== 0 && (v & 0x80) === 0) {
    v = u8(v - 2);                                  // $559E
    r[0x12] = v;
    return (v & 0x80) ? walkerMoveLeft(state, r, v, wallStopWalkerJump)
      : walkerMoveRight(state, r, v, wallStopWalkerJump);
  }
  const min = u8(-r[0x1D]);
  v = u8(v - 1);
  if (v < min) v = min;
  r[0x12] = v;
  return walkerMoveLeft(state, r, v, wallStopWalkerJump);
}

/** ROM: loc_01_53A3 */
function wjAirMove(state, r) {
  const v = r[0x12];
  return (v & 0x80) ? walkerMoveLeft(state, r, v, wallStopWalkerJump)
    : walkerMoveRight(state, r, v, wallStopWalkerJump);
}

// ---------------------------------------------------------------------------
// Shared walker movement: move + probe + ledge scan.
// ---------------------------------------------------------------------------

/** ROM: loc_01_521B (state 1) / loc_01_54E5 (state 2). */
function walkerMoveRight(state, r, v, wallStop) {
  addX(r, i8(v));                                   // sub_01_63AD
  if (probeRight(state, r) !== 0) {                 // sub_01_63B4
    r[0x0F] = 0x80;                                 // $5225: snap X-lo to centre
    return wallStop(state, r);
  }
  return ledgeCheck(state, r, +1);                  // loc_01_5288
}

/** ROM: loc_01_5329 / loc_01_558D. */
function walkerMoveLeft(state, r, v, wallStop) {
  addX(r, i8(v));
  if (probeLeft(state, r) !== 0) {                  // sub_01_6499
    r[0x0F] = 0x80;
    return wallStop(state, r);
  }
  return ledgeCheck(state, r, -1);                  // loc_01_5339
}

/**
 * ROM: loc_01_5228 (state 1). Just hit a wall: clear the walk commitments,
 * then -- if grounded and not mid-animation -- react. r[1] bit 7 latches so a
 * wall is reacted to once: first contact turns (or, via the wall-ahead assist
 * in the probe, jumps), the next merely stops.
 */
function wallStopWalker(state, r) {
  r[0x15] = 0;                                      // $522C
  r[1] &= ~0x10;                                    // $5232
  r[0] &= ~0x08;                                    // $5237
  if (r[0] & 0x01) return riseTail(state, r);       // $5239
  if (r[0] & 0x02) return fallTail(state, r);       // $523E
  const f1 = r[1];                                  // $5244
  if (f1 & 0x60) return riseTail(state, r);         // $5245 -> $552B
  if (f1 & 0x80) {                                  // $524F: latched -- stop
    r[1] = f1 & 0x7F;
    r[0x12] = 0;                                    // $525B
    return riseTail(state, r);
  }
  turnHard(state, r, f1);                           // $5262
  return riseTail(state, r);
}

/** ROM: loc_01_54F3 (state 2) - same, but the turn keeps its facing. */
function wallStopWalkerJump(state, r) {
  r[0x15] = 0;
  r[1] &= ~0x10;
  r[0] &= ~0x08;
  if (r[0] & 0x01) return riseTail(state, r);
  if (r[0] & 0x02) return fallTail(state, r);
  const f1 = r[1];
  if (f1 & 0x60) return riseTail(state, r);
  if (f1 & 0x80) {                                  // $551C
    r[1] = f1 & 0x7F;
    r[0x12] = 0;
    return riseTail(state, r);
  }
  // $5531: unlike state 1 this does NOT flip the facing -- it pushes on into
  // the wall at +-$12, relying on the wall-ahead jump assist to clear it.
  r[1] = f1 | 0xC0;
  r[0x12] = r[5] === 0 ? 0x12 : 0xEE;               // $5540 / $5544
  r[0x18] = 8;                                      // $554B
  return riseTail(state, r);
}

/** ROM: loc_01_5262 - flip facing, walk away at +-$10, start the turn anim. */
function turnHard(state, r, f1) {
  r[1] = f1 | 0xC0;                                 // $5262
  r[5] ^= 1;                                        // $526A
  r[0x12] = r[5] === 0 ? 0x10 : 0xF0;               // $5274 / $5278
  r[0x18] = 8;                                      // $527F
}

/**
 * ROM: loc_01_5288 (rightward) / loc_01_5339 (leftward).
 *
 * After an unobstructed step, scan the column half a metatile ahead (+$80
 * going right, -$90 going left) from one row below the feet down to the world
 * bottom. Any solid cell = ground is coming, keep walking (and re-assert the
 * facing). A completely empty column is a pit: consult the per-level leap
 * table (sub_01_7D09) and either jump it or turn around.
 *
 * Quirk kept: the scan row starts at (Yhi+1) & $0F but ITERATES $20-(Yhi+1)
 * times, so an enemy in the lower half of the map scans past its own column
 * bottom into the top rows of the NEXT column.
 */
function ledgeCheck(state, r, dir) {
  if (r[0] & 0x03) return riseTail(state, r);       // $528F: airborne -- skip
  const x = (r[0x0E] << 8) | r[0x0F];
  const col = u16(x + (dir > 0 ? 0x80 : -0x90)) >> 8;       // $529A / $534B
  const rowBelow = u16(((r[0x10] << 8) | r[0x11]) + 0x100) >> 8;   // $52A6
  let found = false;
  let idx = col * 16 + (rowBelow & 0x0F);           // sub_00_11B9
  for (let n = 0x20 - rowBelow; n > 0; n--, idx++) {
    if (mapCollisionByIndex(state, idx) !== 0) { found = true; break; }  // $52B6
  }
  if (!found) found = gapLeap(state, r);            // $52C5 -> sub_01_7D09
  if (found) {                                      // $52E1 / $537D
    r[5] = dir > 0 ? 0 : 1;
    return riseTail(state, r);
  }
  const f1 = r[1];                                  // $52D4
  if (f1 & 0x60) return riseTail(state, r);
  turnHard(state, r, f1);                           // $52DF -> $5262
  return riseTail(state, r);
}

/**
 * ROM: sub_01_7D09 + tables 1:$7E3F-$7F28.
 *
 * Scripted pit leaps: a per-level nibble table indexed by Xhi>>1 (even column
 * = high nibble) names one of 14 canned {Yvel, Xvel} pairs. Nonzero = launch
 * immediately (bit 0 set right here, unlike the wall jump which waits out the
 * turn animation).
 */
const GAP_TABLE = hexBytes(
  '0000000000000000000000000002002000000000000000000000000000000000' + // $7E3F L1
  '000000000000000000000000000000000700c060b60100010100000000000000' +
  '0000e0000090000000000000000000000000000000700c00100a0520022002b0' + // $7E7F L2 / $7E8F L3
  '6020022002000000000000000000000005000000000000000000000000000000' +
  '0000000000000000000000ea0500000010101010000000000000002002000000' + // $7EB7 L5
  '000c00700000000000000000000000004200240000300030400004002052c000' + // $7EDC L7/L13
  '00800d000000000000000000000000000050a000000000000004000041000000' +
  'a9000e9003e0d038d008');
const GAP_BASE = { 1: 0x00, 2: 0x40, 3: 0x50, 5: 0x78, 7: 0x9D, 0x0D: 0x9D };
/** {Yvel, Xvel} pairs, leap ids 1-14. ROM: $7DBC-$7E25. */
const GAP_LEAPS = [
  [0x10, 0x12], [0x18, 0x13], [0x20, 0x13], [0x23, 0x1C], [0x12, 0x0C],
  [0x23, 0x0F], [0x20, 0x13], [0x23, 0x16], [0x24, 0x20], [0x08, 0x04],
  [0x08, 0x02], [0x10, 0x15], [0x10, 0x10], [0x18, 0x10],
];

function gapLeap(state, r) {
  const lvl = state.level.number;
  const xhi = r[0x0E];
  if (lvl === 3 && xhi >= 0x43) return false;       // $7D39
  if (lvl === 5 && xhi >= 0x4A) return false;       // $7D44
  if ((lvl === 7 || lvl === 0x0D) && xhi >= 0x4C) return false;   // $7D4F
  const base = GAP_BASE[lvl];
  if (base === undefined) return false;             // $7D2B
  const byte = GAP_TABLE[base + (xhi >> 1)] ?? 0;
  const id = (xhi & 1) ? (byte & 0x0F) : (byte >> 4);   // $7D63
  if (id === 0 || id > 14) return false;            // $7D71 / $7DB9
  const [yv, xv] = GAP_LEAPS[id - 1];
  r[0x13] = yv;                                     // per-leap launch velocity
  r[0x12] = (r[5] & 1) ? u8(-xv) : xv;              // $7E26: signed by facing
  r[0] |= 0x01;                                     // $7E31: rising, NOW
  return true;
}

// ---------------------------------------------------------------------------
// State 3 -- flyer (levels 9, 10).  ROM: jt_01_55AA.
// ---------------------------------------------------------------------------

function stFlyer(state, r) {
  if (r[0] & 0x03) return flyAirMove(state, r);     // $55AC
  const f1 = r[1];
  if (f1 & 0x60) return flyAirMove(state, r);       // $55D1: keep momentum
  if (f1 & 0x10) {                                  // $55D9: committed flight
    if (r[0x15] === 0) { r[1] &= ~0x10; return riseTail(state, r); }  // $5648
    r[0x15]--;
    return r[5] === 0 ? flyAccelRight(state, r) : flyAccelLeft(state, r);
  }

  const psx = playerScreenX(state);
  const diff = u8(psx - r[7]);                      // $55E2
  if (diff === 0) {                                 // $55E5 -> $5653
    r[1] = (r[1] & 0xF3) | 0x10;
    r[0x15] = 0x10;
    return riseTail(state, r);
  }
  const playerLeft = psx < r[7];
  const ad = playerLeft ? u8(-diff) : diff;
  if (ad < 0x30 && absDiff8(playerScreenY(state), r[8]) < 0x20) {   // $5606
    // $560A: dive. The direction is the CURRENT facing, not the player side.
    r[0] |= 0x08;
    r[3] = 0x30;                                    // $5613: faster flapping
    r[0x12] = r[5] === 0 ? 0x30 : 0xD0;             // $561F / $5624
    return fallTail(state, r);
  }
  return playerLeft ? flyAccelLeft(state, r) : flyAccelRight(state, r);   // $55F1
}

/** ROM: loc_01_55B4 */
function flyAirMove(state, r) {
  const v = r[0x12];
  return (v & 0x80) ? flyMoveLeft(state, r, v) : flyMoveRight(state, r, v);
}

/** ROM: loc_01_5667 */
function flyAccelRight(state, r) {
  r[5] = 0;
  let v = r[0x12];
  if (v & 0x80) {
    v = u8(v + 2);                                  // $56DC
    r[0x12] = v;
    return (v & 0x80) ? flyMoveLeft(state, r, v) : flyMoveRight(state, r, v);
  }
  const max = r[0x1D];
  v = v + 1 < max ? v + 1 : max;
  r[0x12] = v;
  return flyMoveRight(state, r, v);
}

/** ROM: loc_01_5712 */
function flyAccelLeft(state, r) {
  r[5] = 1;
  let v = r[0x12];
  if (v !== 0 && (v & 0x80) === 0) {
    v = u8(v - 2);                                  // $5750
    r[0x12] = v;
    return (v & 0x80) ? flyMoveLeft(state, r, v) : flyMoveRight(state, r, v);
  }
  const min = u8(-r[0x1D]);
  v = u8(v - 1);
  if (v < min) v = min;
  r[0x12] = v;
  return flyMoveLeft(state, r, v);
}

/** ROM: loc_01_568C */
function flyMoveRight(state, r, v) {
  addX(r, i8(v));
  if (probeRight(state, r) !== 0) {
    r[0x0F] = 0x40;                                 // $5696: flyer snap point
    return flyWallHit(state, r);
  }
  return flyFree(state, r);
}

/** ROM: loc_01_5740 */
function flyMoveLeft(state, r, v) {
  addX(r, i8(v));
  if (probeLeft(state, r) !== 0) {
    r[0x0F] = 0xB0;                                 // $574A
    return flyWallHit(state, r);
  }
  return flyFree(state, r);
}

/**
 * ROM: loc_01_5699. Wall contact resets the flap speed and (if level) starts
 * the turn animation at the current facing -- whose expiry, like the walkers',
 * fires the +$1C jump. That upward hop is how flyers regain altitude.
 */
function flyWallHit(state, r) {
  r[3] = 0x50;                                      // $569D
  r[0] &= ~0x08;                                    // $56A6
  if (r[0] & 0x01) return riseTail(state, r);
  if (r[0] & 0x02) return fallTail(state, r);
  if ((r[1] & 0x60) === 0) {                        // $56B3
    r[1] |= 0x40;                                   // $56BB
    r[0x12] = r[5] === 0 ? 0x10 : 0xF0;             // $56C9 / $56CD
    r[0x18] = 0x0C;                                 // $56D4
  }
  return riseTail(state, r);
}

/** ROM: loc_01_56E7 - free flight; while diving, probe the player each frame. */
function flyFree(state, r) {
  if ((r[0] & 0x08) === 0) return riseTail(state, r);   // $56ED
  if ((state.frame & 0x07) === 0) requestSound(state, 0x1E);   // $56F2
  if (attackProbe(state, r) === 0xFF) return flyWallHit(state, r);   // $5703
  return riseTail(state, r);
}

// ---------------------------------------------------------------------------
// State 11 -- projectile (spawned by sub_01_6BDC).  ROM: jt_01_59E0.
// ---------------------------------------------------------------------------

function stProjectile(state, r) {
  const t = r[0x14];
  if (t === 0) return projHoming(state, r);         // $59E8
  if (t === 1) return projRehome(state, r);         // $59EB -> $5A1F
  return projDrop(state, r);                        // $59EF
}

/** ROM: $5A92 - sink at up to 8 subpx/frame while flying at the +$12 speed. */
function projHoming(state, r) {
  let v = r[0x13] + 1;
  if (v > 8) v = 8;                                 // $5A95
  r[0x13] = v;
  addY(r, v);
  const spd = r[0x12];
  addX(r, (r[5] & 1) ? -spd : spd);                 // $5AAD
  const res = attackProbe(state, r);                // $5AC2
  if (res === 0) return screenTail(state, r);
  if (res === 0xFF) return projHitPlayer(state, r); // $5AC9
  return projWallBounce(state, r);
}

/** ROM: loc_01_5AD1 - flip, slow to +-$20, switch to the falling drop. */
function projWallBounce(state, r) {
  r[5] ^= 1;
  r[0x12] = r[5] !== 0 ? 0xE0 : 0x20;               // $5AD7 / $5ADB
  r[0x14] = 2;                                      // $5AE3
  const variant = r[6];                             // $5AEA
  if (variant === 2) return projExplode(state, r);
  requestSound(state, variant === 4 || variant === 5 ? 0x19 : 0x1D);
  return screenTail(state, r);
}

/** ROM: loc_01_5B0D - remember the player-relative offset, then re-home. */
function projHitPlayer(state, r) {
  const variant = r[6];
  if (variant === 2) return projExplode(state, r);  // $5B12
  if (variant === 4 || variant === 5) return projWallBounce(state, r);  // $5B0A
  r[0x14] = 1;                                      // $5B22
  r[0x15] = 0x20;
  const delta = u16(state.player.y + neg16q((r[0x10] << 8) | r[0x11]));  // $5B2C
  r[0x17] = delta >> 8;                             // $5B4B
  r[0x18] = delta & 0xFF;
  r[0x19] = state.player.facing === r[5] ? 0 : 1;   // $5B58
  return screenTail(state, r);
}

/** ROM: loc_01_5A1F - a hit projectile snaps back beside the player. */
function projRehome(state, r) {
  r[0x15] = u8(r[0x15] - 1);                        // $5A20
  if (r[0x15] === 0) return projDisable(state, r);
  const pf = state.player.facing;
  const dx = ((pf ^ r[0x19]) & 1) ? 0x60 : -0x60;   // $5A3A-$5A4C
  const x = u16(state.player.x + dx);
  r[0x0E] = x >> 8; r[0x0F] = x & 0xFF;
  const y = u16(state.player.y + neg16q((r[0x17] << 8) | r[0x18]));   // $5A6F
  r[0x10] = y >> 8; r[0x11] = y & 0xFF;
  r[5] = u8(pf ^ r[0x19]);                          // $5A87
  return screenTail(state, r);
}

/** ROM: loc_01_59EF - accelerating fall, X bleeding toward 0; gone at 0. */
function projDrop(state, r) {
  r[0x13] = u8(r[0x13] + 1);                        // $59F0
  addY(r, r[0x13]);                                 // $59F6: UNSIGNED (B = 0)
  let v = r[0x12];
  if (v & 0x80) v = u8(v + 1); else v = u8(v - 1);  // $59FC-$5A09
  if (v === 0) return projDisable(state, r);        // $5A0C
  r[0x12] = v;
  addX(r, i8(v));                                   // $5A19
  return screenTail(state, r);
}

/** ROM: loc_01_5B89 - flags cleared to exactly $40, spawn column zeroed. */
function projDisable(state, r) {
  r[0] = 0x40;
  r[0x0E] = 0;
}

/** ROM: loc_01_5B68 - explosion effect ($C744 + sub_00_0CC2, not modelled). */
function projExplode(state, r) {
  return projDisable(state, r);
}

/**
 * ROM: sub_01_6BDC + templates 1:$6CEA (5 x 32 B).
 *
 * Copies a whole prefab record into slot 6 (or 7), then positions it relative
 * to the spawner by mode and stamps the spawner's facing. Returns 0 on success
 * like the original (callers test for zero).
 */
const PROJECTILE_TEMPLATES = [
  '80000b00000001000000040402020000000030000000ff000000000000000400',
  '80000b00000002000000040402020000000040000000ff000000000000000400',
  '80000b00000003000000070702020000000030000000ff000000000000000700',
  '80000b00000004000000040404040000000038000000ff000000000000000400',
  '80000b00000005000000080808080000000038000000ff000000000000000805',
].map(hexBytes);

function spawnProjectile(state, spawner, mode) {
  for (let slot = 6; slot < SLOTS; slot++) {        // $6BDC / $6CDF
    const t = state.enemies[slot];
    if (t[0] & F_ACTIVE) continue;
    t.set(PROJECTILE_TEMPLATES[(mode >= 1 && mode <= 5 ? mode : 5) - 1]);
    const facing = spawner[5];
    t[5] = facing;                                  // $6C2B
    let dxm = mode === 1 ? 0x100
      : (mode === 2 || mode === 3) ? 0x180
        : mode === 4 ? 0x100 : 0xC0;                // $6C3D-$6C5F
    if (facing !== 0) dxm = neg16q(dxm);            // $6C62
    const x = u16(((spawner[0x0E] << 8) | spawner[0x0F]) + dxm);
    t[0x0E] = x >> 8; t[0x0F] = x & 0xFF;
    const dym = mode === 1 ? 0x20
      : mode === 2 ? -0x60 : mode === 3 ? -0x40 : -0x80;   // $6C85-$6CA3
    const y = u16(((spawner[0x10] << 8) | spawner[0x11]) + dym);
    t[0x10] = y >> 8; t[0x11] = y & 0xFF;
    const lvl = state.level.number;                 // $6CAF
    const id = (lvl === 5 || lvl === 7 || lvl === 8 || lvl === 0x0D) ? 0x1B
      : lvl === 0x0B ? 0x2C : lvl === 0x0C ? 0x1F : 0x28;
    requestSound(state, id);
    return 0;
  }
  return 1;
}

// ---------------------------------------------------------------------------
// State 12 -- dormant shell.  ROM: jt_01_5B95.
// ---------------------------------------------------------------------------

function stDormant(state, r) {
  if (r[0] & 0x08) return screenTail(state, r);     // $5B97
  if (r[0] & 0x02) return fallTail(state, r);       // $5B9B
  if (r[1] & 0x20) return screenTail(state, r);     // $5BA0
  r[2] = 0x01;                                      // $5BA7: wake as a walker
  return screenTail(state, r);
}

// ---------------------------------------------------------------------------
// Shared physics tails: rise -> fall -> land -> screen/anim.
// ---------------------------------------------------------------------------

/**
 * ROM: loc_01_5BB6. Rising phase: gravity 1/frame, apex flips to falling,
 * ceiling probe can snap the head back down. Suspended while the turn
 * animation runs (that is what delays a wall jump until the turn completes).
 */
function riseTail(state, r) {
  if ((r[0] & 0x01) && (r[1] & 0x40) === 0) {
    const v = u8(r[0x13] - 1);                      // $5BC8
    if (v === 0) r[0] = (r[0] & ~0x01) | 0x02;      // $5BCC: apex
    r[0x13] = v;
    addY(r, -i8(v));                                // $5BE3: Y -= vel
    const coll = probeUp(state, r);                 // sub_01_64FA
    if (coll !== 0) {
      if (coll !== 0xFF) {                          // $5BF0 (64FA never returns $FF)
        r[0x10] = u8(r[0x10] + 1);                  // $5C01: push down a row
        r[0x11] = r[0x1A];                          // snap to the blob's head line
      }
      r[0x13] = 0;                                  // $5C06
      r[0] = (r[0] & ~0x01) | 0x02;                 // $5C0B
    }
  }
  return fallTail(state, r);
}

/**
 * ROM: loc_01_5C15. Falling: gravity 3/frame toward terminal $BB (-69), or
 * $F8 (-8) for slow-fall records (r[1] bit 1). Grounded records skip gravity
 * but still probe the floor -- walking off a ledge starts the fall here.
 */
function fallTail(state, r) {
  if (r[0] & 0x02) {
    const term = (r[1] & 0x02) ? 0xF8 : 0xBB;       // $5C25 / $5C29
    let v = u8(r[0x13] - 3);
    if (v < term) v = term;                         // $5C32: unsigned clamp
    r[0x13] = v;
    addY(r, -i8(v));
  }
  const res = probeDown(state, r);                  // sub_01_656A
  if (res === 0) {
    if ((r[0] & 0x03) === 0) {                      // $5C57: ground vanished
      r[0] |= 0x02;
      r[1] &= ~0x60;                                // $5C62
    }
  } else {
    r[0x13] = 0;                                    // $5C6E
    if (r[0] & 0x02) {                              // $5C74: landed from a fall
      r[1] |= 0x20;                                 // landing animation
      r[0x19] = 0x0C;
    }
    r[0] &= ~0x03;                                  // $5C87
    // $5C8F: level 10's lower half is water -- draw behind the surface.
    if (state.level.number === 0x0A && r[0x10] >= 0x14) r[9] = 0x80;
  }
  return screenTail(state, r);
}

/**
 * ROM: loc_01_5CA8 plus the draw path ($5CD3-$6063).
 *
 * Every handler funnels through here. It recomputes the stored screen
 * coordinates (which next frame's distance checks read -- they are one frame
 * stale by design), then runs the ANIMATION state machine, which is not
 * cosmetic: the turn animation's expiry is what actually launches the wall
 * jump. The machine is skipped -- jumps delayed! -- whenever the enemy is
 * outside the 7-row vertical window, on the dark frames of the hit blink, or
 * while paused. The selected metasprite id lands in r[6] ($6063) and the draw
 * is queued for drawEnemies(), preserving the ROM's OAM push order.
 */
function screenTail(state, r) {
  const x = (r[0x0E] << 8) | r[0x0F];
  const y = (r[0x10] << 8) | r[0x11];
  r[7] = u8((u16(x - state.camera.x) >> 4) + 8);            // sub_00_1172
  r[8] = u8((u16((y & 0x0FFF) - state.camera.y) >> 4) + 0x10);

  if (absDiff8(u8((state.camera.y >> 8) + 4), r[0x10]) >= 7) return;   // $5CCA
  const lvl = state.level.number;
  if (r[2] === 0x0B) {                              // $5CD4: projectile draw
    const base = [0x6AF3, 0x6AF5, 0x6AF7, 0x6AF9][r[6] - 1] ?? 0x6AFB;  // $5CDD
    queueDraw(state, ar(base + r[5]), r, 0,         // $5D13 / $5D1A
              lvl === 0x0B || lvl === 0x0E);
    return;
  }
  // $5D20 / $5D4A: boss-2 / boss-1 special draws ($C741) -- boss levels only.
  if ((r[0] & 0x04) && (state.frame & 0x08) === 0) return;   // $5DE1: blink
  const alt = lvl === 4 || lvl === 0x0B || lvl === 0x0E;     // $6078 -> 0BAF
  if (state.flow.paused) {                          // $5DF1: draw, no anim tick
    queueDraw(state, r[6], r, r[9], alt);
    return;
  }
  const id = animTick(state, r);
  r[6] = id;                                        // $6063
  // ($606D: sub_00_0F56 bobs the DRAWN Y of a grounded enemy by -2/-3 every
  //  8th frame on levels 6/9/10/11 -- draw-only, not modelled.)
  queueDraw(state, id, r, r[9], alt);
}

/**
 * ROM: $5DFF-$6063 - the animation state machine and metasprite selection.
 * The pose tables live in the ANIM_ROM blob (1:$6891-$6BC0); pointers are
 * per-state, indexed on state-1. Returns the metasprite id.
 */
function animTick(state, r) {
  const st = r[2];
  const facing = r[5];
  const f0 = r[0];
  if (f0 & 0x10) {                                  // $5F39: ranged-attack pose
    // ($5F5B: $C73F swaps in $6B7D for boss 3 -- boss levels, not modelled.)
    const base = st === 2 ? 0x6AFD : st === 7 ? 0x6B1D : st === 8 ? 0x6B3D : 0x6B5D;
    return ar(base + ((r[0x14] & 0x3F) >> 2) + (facing << 4));
  }
  if (f0 & 0x08) {                                  // $5F85: melee pose
    const ptr = arw(0x691B + (st - 1) * 2);
    if ((ptr >> 8) !== 0xFF) {                      // $5F98
      // ($5F9D-$5FC0: +$10 offsets under $C73E/$C73F -- boss levels.)
      return ar(ptr + ((r[0x14] & 0x1F) >> 2) + (facing << 3));
    }
    return walkCycle(state, r, facing);             // $5FDB
  }
  if (f0 & 0x01) {                                  // $5F24: rising pose
    return ar(arw(0x68EF + (st - 1) * 2) + facing);
  }
  if (f0 & 0x02) {                                  // $5F0A: falling pose
    if (st === 7) return ar(0x6B9D + facing);
    if (st === 1) return ar(0x6B9F + facing);
    return ar(arw(0x68EF + (st - 1) * 2) + facing);
  }
  if (f0 & 0x20) {                                  // $5E2B: idle sway
    // ($5E3E: level-14 chaser variant -- boss level.)
    return ar(arw(0x6A97 + (st - 1) * 2) + ((state.frame & 0x18) >> 3) + facing * 4);
  }
  if (r[1] & 0x20) {                                // $5E61: landing animation
    if (r[0x19] === 0) { r[1] &= ~0x20; return r[6]; }     // $5E90
    r[0x19]--;
    return ar(arw(0x69F3 + (st - 1) * 2) + ((r[0x19] & 0x0C) >> 2) + facing * 4);
  }
  if (r[1] & 0x40) {                                // $5EA0: turn animation
    if (r[0x18] === 0) {
      r[1] &= ~0x40;                                // $5ECF
      r[0] |= 0x01;                                 // the jump launches NOW
      // ($5ED8: level 4 rolls a rLY-based crit adding $10 -- boss level,
      //  unported; rLY is not modelled.)
      r[0x13] = r[0x1C];                            // $5EF6: jump velocity
      return r[6];
    }
    r[0x18]--;
    return ar(arw(0x6A53 + (st - 1) * 2) + ((r[0x18] & 0x0C) >> 2) + facing * 4);
  }
  return walkCycle(state, r, facing);
}

/** ROM: loc_01_5FE6 - r[3] = period<<4|subtimer, r[4] = (frames-1)<<4|frame. */
function walkCycle(state, r, facing) {
  const period = r[3] >> 4;
  const sub = (r[3] & 0x0F) + 1;
  let frame;
  const hi = r[4] >> 4;
  if (sub < period) {                               // $5FF5 -> $601C
    r[3] = (period << 4) | sub;
    frame = r[4] & 0x0F;
  } else {
    r[3] = period << 4;                             // $5FF9
    frame = (r[4] & 0x0F) + 1;
    if (frame < hi + 1) r[4] = (hi << 4) | frame;   // $6013
    else { frame = 0; r[4] = hi << 4; }             // $6009
  }
  // $602A: offset = facing * frames + frame (the ADD loop), frames = hi+1.
  return ar(arw(0x6891 + (r[2] - 1) * 2) + facing * (hi + 1) + frame);
}

function queueDraw(state, id, r, attr, alt) {
  if (!state.enemyDraws) state.enemyDraws = [];
  state.enemyDraws.push({ id, x: r[7], y: r[8], attr, alt });
}

/**
 * Flush the frame's queued enemy sprites. ROM: sub_00_0BC6 pushes during the
 * enemy driver itself; queueing keeps that OAM order (parity-alternating slot
 * order included) while letting main.js own the manifest. Levels $04/$0B/$0E
 * draw from the alternate table 5:$736B (sub_00_0BAF), the rest from 5:$5F5C.
 */
export function drawEnemies(state, manifest) {
  const q = state.enemyDraws;
  if (!q || !manifest.metasprites) return;
  for (const d of q) {
    const table = d.alt ? manifest.metasprites.table2 : manifest.metasprites.table1;
    // r[7]/r[8] are OAM coordinates (+8, +16); the sprite queue is in screen
    // coordinates, so the hardware offsets come back off here.
    drawMetasprite(state, table, d.id, d.x - 8, d.y - 16, d.attr);
  }
  q.length = 0;
}

/**
 * Metasprite-id tables, 1:$6891-$6BC0: per-state pointer rows (walk $6891,
 * rise/fall $68EF, melee $691B, landing $69F3, turn $6A53, idle $6A97,
 * projectile variants $6AF3, ranged poses $6AFD+). Byte-verified against the
 * ROM. `ar`/`arw` read a byte / little-endian pointer by ROM address.
 */
const ANIM_ROM = hexBytes(
  'a568ad68b568c168cd68d168d968dd68e168e9684f5051524b4c4d4e63646566' +
  '5f6061622223242526271c1d1e1f20213a393b393c393a393b393c39b3b3b3b3' +
  'bcbdbebfb8b9babbd1d3d0d201010000292a292a2c2e2b2d4042443f41430769' +
  '09690b6907690d690f69116913691569176907691969565464602829b3b3c5c2' +
  'e7e60d0c201f52515b5b33694369ffff33695369636973699369b369c369ffff' +
  'e3695a5a5a59595959595858585757575757787a7c7b7a797870737577767574' +
  '736db2b2b1b1b0b0afafaeaeadadacacababc3c3c4c4c4c4c3c3c0c0c1c1c1c1' +
  'c0c0d9d9d9d9d7d7d5d5d8d8d8d8d6d6d4d4ededebebe9e9e9e7ececeaeae8e8' +
  'e8e6151413131313131315141313131313131212121212121210111111111111' +
  '110f282828262624242427272725252323234a4a4a4848464640494949474745' +
  '453f5050504e4e4c4c404f4f4f4d4d4b4b3f9595959594949494959595959494' +
  '94940b6a136a1b6a0b6a0b6a236a2b6a336a3b6a436a0b6a4b6a555555555353' +
  '53536c6c706469696d60492749494a214a4ac5c5c5c5c2c2c2c2d1d1ededd0d0' +
  'ecec0d0d0d0d0c0c0c0c2222222221212121404444443f4343435c5c5c5c5c5c' +
  '5c5c0b6a676a6f6a0b6a0b6a776a7f6a0b6a876a8f6a70706c6c6d6d69692827' +
  '494929214a4ac5c5c5c5c2c2c2c2e7e7d1d1e6e6d0d022222222212121215244' +
  '44405143433fab6ab36affffab6abb6ac36acb6ad36adb6aeb6a5c5c5e5e5c5c' +
  '5e5e7e6a7e6a7d677d67b3b3b3b3b3b3b3b3c5c5c5c5c2c2c2c2cfcfcfcfcece' +
  'cece17171717161616162c2c2c2c2b2b2b2b3838383837373737444442404343' +
  '413f807fc7c6f1f00e0e3e3d7271707070707070ffffffffffffffff6f6e6d6d' +
  '6d6d6d6dffffffffffffffffdfdfdfdddddbdbdbffffffffffffffffdedededc' +
  'dcdadadaffffffffffffffff0b0b090705030101ffffffffffffffff0a0a0806' +
  '04020000ffffffffffffffff30303032321a1b19ffffffffffffffff2f2f2f31' +
  '311a1b19ffffffffffffffff363636363636363636343434341a1b1935353535' +
  '3535353535333333331a1b19edec5d5be1e0efee585656545454545755555353' +
  '53535a5a5c5e5e606259595b5d5d5f61');
const ANIM_BASE = 0x6891;
const ar = (addr) => ANIM_ROM[addr - ANIM_BASE] ?? 0;
const arw = (addr) => ar(addr) | (ar(addr + 1) << 8);

// ---------------------------------------------------------------------------
// The enemy's own collision probe.  ROM: sub_01_6666 and its mode wrappers.
// ---------------------------------------------------------------------------

const collIdx = mapCollisionByIndex;

/**
 * ROM: sub_01_6666. One cell sample at (position + offset), with per-mode
 * empty-cell fallbacks -- the enemy-side mirror of the player's sub_00_20BA.
 *
 * Mode 1/2 (horizontal): on an empty cell, remember the address one COLUMN
 * further in the travel direction in $FFBE (a true HRAM global -- see
 * wallResolve), then sweep the cells above/below within the hitbox. Quirk
 * kept: the sweep reads the RECORD's own Y-lo, not the probe point's.
 *
 * Mode 3/4 (vertical): sweep the cells west/east within the hitbox; mode 4
 * additionally tests the $C1E8 object array so enemies can stand on platforms.
 *
 * Mode 5 (attack): water reads as empty, and an empty cell becomes a
 * screen-space overlap test against the player that deals the 1:$6BC1 contact
 * damage. Returns $FF on a player hit.
 */
function probeCore(state, r, dx, dy, mode) {
  const px = u16(((r[0x0E] << 8) | r[0x0F]) + dx);  // $FFBA/$FFBB
  const py = u16(((r[0x10] << 8) | r[0x11]) + dy);  // $FFBC/$FFBD
  if (py >> 8 >= 0x20) return 0;                    // $6680: below the world
  const idx = (px >> 8) * 16 + ((py >> 8) & 0x0F);  // sub_00_11B9
  const coll = collIdx(state, idx);
  if (coll !== 0 && !(mode === 5 && coll === 0x08)) return coll;   // $6691-$66A0

  if (mode === 5) return attackEmpty(state, r, px, py);            // $6748

  if (mode <= 2) {                                  // $66EA: horizontal
    state.enemyBesideIdx = idx + (mode === 1 ? 16 : -16);          // $FFBE
    const subY = r[0x11] >> 4;                      // $671B: the RECORD's Y-lo
    if (subY < u8(r[0x0C] - 2)) {                   // $6716: pokes above
      const above = collIdx(state, idx - 1);
      if (above !== 0) return above;                // $6735
    }
    if (u8(subY + u8(r[0x0D] - 2)) >= 0x10) {       // $6723: pokes below
      const below = collIdx(state, idx + 1);
      if (below !== 0) return below;                // $673F
    }
    return 0;
  }

  const subX = r[0x0F] >> 4;                        // $66AF: vertical
  if (subX < u8(r[0x0B] - 2)) {                     // $66B4: past the left edge
    const west = collIdx(state, idx - 16);
    if (west !== 0) return west;                    // $66DC
  }
  if (u8(subX + u8(r[0x0A] - 2)) >= 0x10) {         // $66BF: right edge
    const east = collIdx(state, idx + 16);
    if (east !== 0) return east;                    // $66D1
  }
  if (mode === 4) return objectPlatform(state, r, px, py);   // $67C2
  return 0;
}

/**
 * ROM: loc_01_6748 - mode 5 hit the player?
 *
 * Quirks kept: the X window is a fixed 8 px, but the Y window is the player's
 * half-WIDTH ($FF8C), not height; and the invulnerability stamp direction
 * comes from the ENEMY's facing.
 */
function attackEmpty(state, r, px, py) {
  const p = state.player;
  if (p.dead) return 0;                             // $674B: $C715
  const sx = u8((u16(px - state.camera.x) >> 4) + 8);        // sub_00_1172
  const sy = u8((u16((py & 0x0FFF) - state.camera.y) >> 4) + 0x10);
  if (absDiff8(playerScreenX(state), sx) >= 8) return 0;     // $6770
  if (absDiff8(playerScreenY(state), sy) >= p.halfW) return 0;   // $6779
  if (p.iframes !== 0) return 0;                    // $677D

  const t = state.tables;                           // $6790: 1:$6BC1[state]
  let dmg = t.enemyContactDamage[r[2]] ?? 0;
  if (dmg & 0x80) {                                 // $6795: + 1:$6BCE[level-1]
    dmg = (dmg & 0x7F) + (t.levelDamageBonus[state.level.number - 1] ?? 0);
  }
  p.hp = Math.max(0, p.hp - dmg);                   // sub_00_2777
  requestSound(state, 0x12);
  p.iframes = (r[5] & 0x01) ? 0xDA : 0x5A;          // $67AD: by ENEMY facing
  return 0xFF;
}

/**
 * ROM: loc_01_67CC - mode 4's empty cell can still be an active $C1E8 object.
 * The overlap is tested in SCREEN space at three probe points (centre, -7 px,
 * +6 px) against the object's +7/+8 bytes as half-extents and its +9/+10 as
 * screen coordinates; a hit snaps the enemy on top and lands it ($FF).
 * (actors.js does not maintain +9/+10 yet -- blob values are used as-is.)
 */
function objectPlatform(state, r, px, py) {
  const sx = u8((u16(px - state.camera.x) >> 4) + 8);        // $67D6
  const sy = u8((u16((py & 0x0FFF) - state.camera.y) >> 4) + 0x10);
  for (let slot = 0; slot < 8; slot++) {            // $67E1
    const a = state.actors[slot];
    if ((a[0] & 0x80) === 0) continue;              // $67EB
    const halfW = a[7], halfH = a[8];               // $67F6: -> $C75A/$C72E
    if (a[3] < 0x10 || a[3] >= 0x20) continue;      // $6806
    const ox = a[9], oy = a[10];                    // $6813
    let hit = absDiff8(ox, sx) < halfW;             // $682A
    if (!hit) hit = absDiff8(ox, u8(sx + 0xF9)) < halfW;     // $6837: -7 px
    if (!hit) hit = absDiff8(ox, u8(sx + 0x06)) < halfW;     // $6844: +6 px
    if (!hit) continue;
    if (absDiff8(oy, sy) >= halfH) continue;        // $684E
    const c = u8(r[0x0D] + halfH - 1);              // $685C
    const ny = u16(((a[3] << 8) | a[4]) + neg16q((c << 4) & 0xFFFF));  // $6874
    r[0x10] = ny >> 8;                              // $6879
    r[0x11] = ny & 0xFF;
    return 0xFF;
  }
  return 0;
}

/**
 * ROM: sub_01_63B4 (rightward) / sub_01_6499 (leftward): probe at the hitbox
 * edge, resolve the collision class, and -- when the edge cell is empty but
 * the NEXT column over is not -- run the wall-ahead assist.
 */
function probeRight(state, r) {
  return wallResolve(state, r, probeCore(state, r, r[0x0A] << 4, 0, 1), 1);
}

function probeLeft(state, r) {
  return wallResolve(state, r, probeCore(state, r, -(r[0x0B] << 4), 0, 2), 2);
}

/** ROM: $63E8 / $64CF - shared tail of both horizontal probes. */
function wallResolve(state, r, coll, mode) {
  if (coll === 0x02 || coll === 0x03) return 1;     // conveyors are walls
  if (coll === 0x08) { r[9] = 0x80; return 0; }     // $648A: water
  if (coll === 0xFD) return 1;                      // spikes
  if ((coll & 0x1F) === 0x1F) return 1;             // doors (catches $FF too)
  if (coll >= 0x20) return 0;                       // pickups pass through
  if (coll !== 0) return coll;
  // $640C: the probed cell is empty -- read the beside-cell address the
  // EMPTY-CELL PATH stored in $FFBE. If the probe bailed before storing it
  // (off-world) this reads a STALE address from an earlier probe. Reproduced:
  // state.enemyBesideIdx persists across probes, slots and frames.
  if (collIdx(state, state.enemyBesideIdx) === 0) return 0;
  wallAhead(state, r, mode);                        // $6415
  return 0;
}

/**
 * ROM: loc_01_6415 - a wall is coming one column ahead. Point the record at
 * it and, on alternate encounters (r[1] bit 7 latch), JUMP: rising with the
 * +$1C velocity, at +-$0C horizontally. This is the state-2 "walker+jump"
 * signature move, but it applies to every non-boss state.
 */
function wallAhead(state, r, mode) {
  const st = r[2];
  if (st === 6 || st === 7 || st === 8) return;     // $641C
  if (r[1] & 0x60) return;                          // $6429: mid-animation
  if (r[0] & 0x03) return;                          // $6431: airborne
  const boss4 = state.level.bossId === 4;           // $643D: $C73E
  if (boss4 ? mode !== 2 : mode === 2) {            // $6444 / $644D
    r[5] = 1; r[0x12] = 0xF4;                       // $645A
  } else {
    r[5] = 0; r[0x12] = 0x0C;                       // $6454
  }
  if (r[1] & 0x80) { r[1] &= 0x7F; return; }        // $6468: latch alternates
  r[1] |= 0x80;                                     // $6470
  r[0] = (r[0] & 0xC7) | 0x01;                      // rising
  r[0x13] = r[0x1C];                                // $647D: jump velocity
}

/** ROM: sub_01_64FA - ceiling probe (mode 3), offset -halfH-up. */
function probeUp(state, r) {
  const coll = probeCore(state, r, 0, -(r[0x0C] << 4), 3);
  if (coll === 0x02 || coll === 0x03) return 1;
  if (coll === 0x08) { r[9] = 0x80; return 0; }
  if (coll === 0xFD) {                              // $6542 -> $6552: spikes
    if ((r[0] & 0x04) === 0) {
      r[0] |= 0x04;                                 // stun + blink
      r[0x17] = 0x3C;
      r[0x16] = u8(r[0x16] - 1);                    // $6565: spikes cost 1 HP
    }
    return 0;
  }
  if ((coll & 0x1F) === 0x1F) return 1;
  if (coll >= 0x20) return 0;
  return coll;
}

/**
 * ROM: sub_01_656A - floor probe (mode 4), offset +halfH-down. Nonzero means
 * "landed"; most solids snap Y so the feet sit exactly on the probed row
 * (spikes included -- enemies stand on spikes unharmed). $FF (runtime solid,
 * or the object-platform hit which snapped Y itself) lands WITHOUT the snap.
 */
function probeDown(state, r) {
  const dy = r[0x0D] << 4;
  const coll = probeCore(state, r, 0, dy, 4);
  if (coll === 0x02 || coll === 0x03) {             // $65EE / $6602: conveyor
    r[0x11] = r[0x1B];                              // snap to the blob's foot line
    addX(r, coll === 0x02 ? 4 : -4);
    return 1;
  }
  if (coll === 0x08) { r[9] = 0x80; return 0; }
  if (coll === 0xFD) return floorSnap(state, r, dy);   // $65AA -> $65C0
  if (coll === 0xFF) return 0xFF;                   // $65AE
  if ((coll & 0x1F) === 0x1F) return 1;
  if (coll >= 0x20) return 0;
  if (coll === 0) return 0;
  return floorSnap(state, r, dy);                   // $65BE falls into $65C0
}

/** ROM: loc_01_65C0 - Y = probedRow*256 - halfH-down*16. */
function floorSnap(state, r, dy) {
  const row = u16(((r[0x10] << 8) | r[0x11]) + dy) >> 8;   // $FFBC
  const ny = u16((row << 8) - dy);
  r[0x10] = ny >> 8;
  r[0x11] = ny & 0xFF;
  return 1;
}

/**
 * ROM: sub_01_6616 - the attack probe: mode 5 at the record's +$1E/+$1F
 * offsets (X negated when facing left, Y sign-extended), both in pixels.
 */
function attackProbe(state, r) {
  let dx = (r[0x1E] << 4) & 0xFFFF;
  if (r[5] & 0x01) dx = neg16q(dx);                 // $6639
  const dy = u16(i8(r[0x1F]) << 4);                 // $6648
  return probeCore(state, r, dx, dy, 5);
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** ROM: sub_01_63AD - 16-bit big-endian add on the record. */
function addX(r, d) {
  const v = u16(((r[0x0E] << 8) | r[0x0F]) + d);
  r[0x0E] = v >> 8;
  r[0x0F] = v & 0xFF;
}

function addY(r, d) {
  const v = u16(((r[0x10] << 8) | r[0x11]) + d);
  r[0x10] = v >> 8;
  r[0x11] = v & 0xFF;
}

/**
 * The ROM's 16-bit negate idiom (CPL both bytes, +1 unless the complemented
 * low byte is already zero). For lo = $FF the +1 is skipped and the result is
 * short by $100 -- kept faithful; see $6639, $6C68, $5B30.
 */
function neg16q(v) {
  const lo = u8(~v), hi = u8(~(v >> 8));
  return lo === 0 ? hi << 8 : u16((hi << 8) + lo + 1);
}

/** 8-bit absolute difference, as the SUB / JR NC / CPL / INC idiom computes. */
function absDiff8(a, b) {
  return (a & 0xFF) >= (b & 0xFF) ? u8(a - b) : u8(b - a);
}

/** ROM: $1B4A -> sub_00_1172. $FF93/$FF94 recomputed from live state; the
 *  original stores them each frame before the enemy driver runs. */
function playerScreenX(state) {
  return u8((u16(state.player.x - state.camera.x) >> 4) + 8);
}

function playerScreenY(state) {
  return u8((u16((state.player.y & 0x0FFF) - state.camera.y) >> 4) + 0x10);
}

/** ROM: sub_00_0AE1 mailbox. */
function requestSound(state, id, mask = 0x01) {
  if (state.sound && state.sound.queue.length < 4) {
    state.sound.queue.push({ id, mask });
  }
}

// Exposed for the unit tests only.
export const _internals = {
  probeCore, probeRight, probeLeft, probeUp, probeDown, attackProbe,
  wallAhead, gapLeap, ledgeCheck, spawnProjectile, riseTail, fallTail,
  screenTail, neg16q, absDiff8, stunnedTick, primaryDispatch,
};
