// The enemy driver -- sub_01_4E0C.
//
// ROM range: sub_01_4E0C (the slot loop), loc_01_6094 (activate),
// sub_00_11A7 (despawn), loc_01_4EB8 (kill) and its shared tail, loc_01_50C3
// with table 1:$50D3 (the primary dispatch), loc_01_4F21 / loc_01_4F84 /
// loc_01_4FF5 / loc_01_5049 (the stun countdown and the two knockbacks),
// loc_01_60DD with table 1:$60EF (the hit dispatch) and jt_01_6107 (the basic
// attack tick), plus sub_00_2889's load and the $0DC8 effect-RAM wipe.
//
// THIS IS THE ONLY FILE IN THE PORT THAT KNOWS ANY ORDER.
//
// After Phase 9 every state and boss handler lives in its own module and none
// of them knows what runs before or after it. What is left here is exactly the
// order, and there are three separate orders in this file:
//
//   1. THE SLOT DIRECTION, at the `descending` line in updateEnemies. $4E13
//      reads $FFA7: even frames walk slots 0->7, odd frames 7->0. It decides
//      which enemy wins when two would act on the same thing in one frame --
//      the last free effect slot, for instance -- and whether a projectile
//      spawned into slot 6 runs on its own spawn frame or the next.
//   2. THE TEN-ARM LADDER inside the loop, $4E27 through $4F1E. Every arm is
//      `continue` or `return`, so the FIRST match wins and the order of the
//      tests is the semantics. It is kept as straight-line transcription of
//      $4E27..$4F1E rather than a table of {name, test, run}: the listing has
//      to stay readable against the disassembly.
//   3. THE DRAW QUEUE's insertion order, which the loop feeds one slot at a
//      time and enemies/anim.js flushes.
//
// ALL THREE ARE PROTECTED BY games/batman/tests/enemy-order.test.js -- slot
// visit order at both $FFA7 parities, the effect-slot contention that gives
// that order a consequence, the spawn-frame question, the arm ladder pair by
// pair, and the killTail abandon -- and by frameorder.test.js for where
// updateEnemies sits in the frame. Before those existed, five distinct order
// mutations in this code all passed 691/691. Do not reorder anything in this
// file without running both.
//
// The two `default: return` arms in primaryDispatch and hitDispatch are NOT
// throws, deliberately. UNIMPLEMENTED_STATES is empty and the path is claimed
// unreachable -- but an untested claim of unreachability is exactly the kind
// of claim this project has been burned by, and turning it into a throw is a
// behaviour change on a path nothing has proved is dead.

import { u8 } from '../state.js';
import { spawnDrop } from '../drops.js';
import {
  effects, resetEffects, bossCountdownTick, victoryStep,
  COUNTDOWN_IDLE, COUNTDOWN_START,
} from '../effects.js';
import { spawnEffect } from '../doors.js';
import {
  SLOTS, RECORD, F_ACTIVE, F_DISABLED,
  E_FLAGS, E_STATE, E_FACING, E_SCREEN_X, E_ATTR,
  E_X_HI, E_X_LO, E_Y_HI, E_Y_LO, E_VX, E_HP,
} from './record.js';
import { absDiff8, playerScreenX, requestSound } from './util.js';
import { attackProbe } from './probe.js';
import { riseTail, screenTail } from './tails.js';
import { bossIntroTick } from './intro14.js';
import { stDormant, attackTickDormant } from './states/dormant.js';
import { stChaser } from './states/chaser14.js';
import { stL6Vehicle, attackTickL6 } from './states/vehicle6.js';
import { stFlyer, attackTickFlyer } from './states/flyer.js';
import { stProjectile } from './states/projectile.js';
import { stL12, attackTickL12 } from './states/shooter12.js';
import { stWalker, stWalkerJump, attackTickWalkerJump } from './states/walker.js';
import { stBoss1, attackTickBoss1 } from './bosses/boss1.js';
import { stBoss2, stBoss2Part, attackTickBoss2 } from './bosses/boss2.js';
import { stBoss3, attackTickBoss3 } from './bosses/boss3.js';
import { stBoss4, attackTickBoss4 } from './bosses/boss4.js';

/** Camera-relative windows. ROM: $60A9 (activate), sub_00_11A7 (despawn). */
const ACTIVATE_RANGE = 7;
const DESPAWN_RANGE = 9;
const DEATH_ROW = 0x21;

/**
 * State handlers at 1:$50D3 not yet ported. 1-3 cover every non-boss enemy
 * outside the boss levels; 11/12 are the projectile and the dormant shell the
 * ported states spawn into / wake from.
 *
 * All 13 states are now ported. State 5 (the level-6 vehicle target) is a
 * TRANSCRIPTION ONLY -- see its header -- because its X rides $FFCA/$FFCB,
 * which only level 6's unported sub_00_2CBE branch scrolls. The set is kept
 * (empty) because unit tests import it.
 */
export const UNIMPLEMENTED_STATES = new Set([]);

export function createEnemies() {
  return Array.from({ length: SLOTS }, () => new Uint8Array(RECORD));
}

/** ROM: sub_00_2889 block-copies count x 32 B straight into $C268. */
export function loadEnemies(state, records, count) {
  for (let i = 0; i < SLOTS; i++) {
    state.enemies[i].fill(0);
    if (i < count) state.enemies[i].set(records.subarray(i * RECORD, (i + 1) * RECORD));
  }
  // $0DC8-$0DCA rearms $C740 = $FF beside $C73E, and sub_00_29A5 wipes $C693
  // and the rest of the effect RAM, at exactly this point in level init. The
  // port hangs it off the enemy load because that is the level-init hook this
  // file already owns; src/level.js needs no change for it (see REPORT).
  resetEffects(state);
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

  if (state.flow.bossMode) return bossIntroTick(state);   // $4E0C -> 1:$77BD

  const descending = state.parity !== 0;            // $4E13
  for (let n = 0; n < SLOTS; n++) {
    const slot = descending ? SLOTS - 1 - n : n;
    state.enemyCursor = slot;                       // $FFB3
    const r = state.enemies[slot];

    if ((r[E_FLAGS] & F_ACTIVE) === 0) { tryActivate(state, r); continue; }   // $4E27
    if (state.flow.paused || state.lagFrame) {      // $4E2C / $4E39
      screenTail(state, r);                         // -> loc_01_5CA8 directly
      continue;
    }

    if (shouldDespawn(state, r)) {                  // $4E4D -> sub_00_11A7
      r[E_FLAGS] &= ~F_ACTIVE;                      // $4E55: RES 7 only
      continue;
    }

    r[E_ATTR] = 0;                                  // $4E60: attr rebuilt per frame
    if (r[E_Y_HI] >= DEATH_ROW) {                   // $4E69: fell out
      if (killTail(state, r) === 'stop') return;
      continue;
    }
    if (r[E_HP] === 0) {                            // $4E75: HP gone
      // $4E7A: boss levels take the branch at $4E82 and spawn NOTHING. Only
      // an ordinary level drops anything, and only from HP reaching zero --
      // the fell-out-of-the-world arm above jumps straight past this.
      // MEASURED: levels 4, 8 and 11 leave the pool empty when their enemies
      // die; level 3 fills slot 0 the same frame.
      if (state.level.bossId === 0) {
        // $4E88: both spawners read the enemy's live position out of
        // +$0E..+$11 -- the copy at $4E88 stages it in $C744-$C747 for the
        // effect pool AND $C749-$C74C for the ballistic pool, so they land on
        // the same point.
        const ex = (r[E_X_HI] << 8) | r[E_X_LO], ey = (r[E_Y_HI] << 8) | r[E_Y_LO];
        // $4EA5: D = $97, E = $03. The old comment here said "purely visual",
        // and that was measured WRONG: $97 has bit 7 set and counter $17, so
        // doors.js's tickEffect fires the $13E6 one-shot -- cue $17 -- on the
        // effect's first tick. MEASURED (cuediff l3-heart, l3-batarang-kill):
        // the cartridge asks for 11 cues per run and the port asked for 10,
        // and the missing one is the explosion every kill makes.
        spawnEffect(state, ex, ey, 0x97, 0x03);     // $4EA9
        spawnDrop(state, ex, ey, 0xFF, 0x00, 0x00); // $4EAC/$4EB1: dir $FF, DE = 0
      }
      if (killTail(state, r) === 'stop') return;
      continue;
    }

    // loc_01_4F0E: hit-state prelude before the type dispatch.
    if (r[E_FLAGS] & F_DISABLED) {                            // $4F11: BIT 6
      if (killTail(state, r) === 'stop') return;
      continue;
    }
    if (r[E_FLAGS] & 0x04) { stunnedTick(state, r); continue; }     // $4F15: BIT 2
    if (r[E_FLAGS] & 0x18) { hitDispatch(state, r); continue; }     // $4F19 -> $60DD
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
export function tryActivate(state, r) {
  const xhi = r[E_X_HI];
  if (xhi === 0) return;                            // $609B

  const camCol = u8((state.camera.x >> 8) + 5);     // $60A0
  if (absDiff8(camCol, xhi) >= ACTIVATE_RANGE) return;    // $60A9
  if (r[E_FLAGS] & F_DISABLED) return;              // $60AF: BIT 6
  if (r[1] === 0x01) {                              // $60B5
    // $60BC: only when the enemy's column equals camera - 2, exactly.
    if (xhi !== u8((state.camera.x >> 8) - 2)) return;
  }
  r[E_FLAGS] |= F_ACTIVE;                           // $60C5: SET 7
}

/**
 * ROM: sub_00_11A7 - the despawn window is wider than the activation one, and
 * tests ONLY the X distance; falling out of the world is the driver's separate
 * $4E69 check (which disables permanently, where this one merely deactivates).
 */
export function shouldDespawn(state, r) {
  const camCol = u8((state.camera.x >> 8) + 5);
  return absDiff8(camCol, r[E_X_HI]) >= DESPAWN_RANGE;
}

/**
 * ROM: loc_01_4EB8 -- every death funnels through here, and it is NOT just a
 * flag write. The port treated it as one for a long time, which is why no
 * boss death ever raised a level clear.
 *
 * The arm, in the cartridge's order:
 *
 *   $4EB8  $C740 != $FF        -> JP $78CC, the post-death countdown
 *   $4EC0  flags = (f & $43) | $40
 *   $4EC8  state == $0B        -> done (a projectile just disappears)
 *   $4ECE  $C73E == 0          -> done (ordinary level: nothing more to do)
 *   $4ED5  flags & $03         -> re-ACTIVATE and keep dispatching
 *   $4EE0  otherwise: this was the boss, and the level is over
 *
 * The `flags & $03` arm is the subtle one and it is why the old level-clear
 * stopgap had to warn about it: a boss killed in mid-air still has its
 * rising/falling bit set, so the cartridge puts bit 7 back and runs the state
 * machine again -- the death does not "take" until it lands. Short-circuiting
 * there leaves a dead boss latched airborne and the clear never fires.
 *
 * @returns 'done' | 'dispatch' | 'countdown' -- what the caller should do next.
 */
export function kill(state, r) {
  // $4EB8: `LD A,[$C740] / CP $FF / JP NZ, loc_01_78CC`. Once a boss has died
  // EVERY enemy that reaches the kill path reroutes into the countdown -- and
  // the countdown decrements $C740 once per enemy that gets there, which is
  // why the measured trace shows exactly one step per frame on the boss levels
  // (the boss is the only record that ever arrives).
  if (effects(state).countdown !== COUNTDOWN_IDLE) return 'countdown';

  r[E_FLAGS] = (r[E_FLAGS] & 0x43) | F_DISABLED;    // $4EC0

  if (r[E_STATE] === 0x0B) return 'done';           // $4EC8: projectiles
  if (state.level.bossId === 0) return 'done';      // $4ECE: $C73E

  if (r[E_FLAGS] & 0x03) {                          // $4ED5: still airborne
    r[E_FLAGS] |= 0x80;                             // $4EDA: back to active
    return 'dispatch';                              // $4EDD: JP loc_01_50C3
  }

  // $4EE0 -- the boss is down.
  // $4EE6: BC = $0104, so sound id $01 with mask $04, the FADE-OUT mask. The
  // music does not stop, it fades. Level 6 is excluded ($4EE2: CP $06).
  if (state.level.number !== 0x06) requestSound(state, 0x01, 0x04);
  r[E_FLAGS] = 0x81;                                // $4EEC
  // $4EF1: $C740 = $FE. NOT the level clear -- that is another ~630 frames
  // away, through 1:$78CC's 254-frame explosion burst and loc_00_34D0's
  // fanfare. flow.levelCleared is raised at the far end of both, in
  // effects.js's updateVictoryHold, which is the port's loc_00_35E8.
  effects(state).countdown = COUNTDOWN_START;
  effects(state).explosion = 0;                     // $4EF8: $C713 = 0
  state.player.iframes = 0;                         // $4EF5: $C714
  if (state.level.bossId === 0x02) {                // $4EFB: boss 2's two parts
    state.enemies[1][0] = 0x40;                     // $4F05: $C288
    state.enemies[2][0] = 0x40;                     // $4F08: $C2A8
  }
  return 'done';
}

/**
 * The three $4E69/$4E75/$4F11 arms all end in the same `JP loc_01_4EB8`, so
 * they share this tail.
 *
 * The countdown's two halves do NOT end the same way, and it matters:
 * 1:$78CC's first half falls out at `JP loc_01_5CA8` (the screen tail, so the
 * cached +7/+8 keep tracking), while 1:$7936's second half ends at
 * `JP loc_01_60C7` (the loop continuation) and leaves them stale. And when the
 * countdown hits zero it jumps into loc_00_34D0, whose `RET` unwinds past the
 * whole driver -- no further slot is walked that frame.
 *
 * @returns 'stop' when the enemy loop must end for this frame
 */
export function killTail(state, r) {
  const what = kill(state, r);
  if (what === 'dispatch') { primaryDispatch(state, r); return 'next'; }
  if (what !== 'countdown') return 'next';
  const where = bossCountdownTick(state, r);
  if (where === 'victory') {
    victoryStep(state);                             // $793A / $7959
    return 'stop';                                  // loc_00_34D0 ends in RET
  }
  if (where === 'screen') screenTail(state, r);     // $78E0 / $7933
  return 'next';                                    // $7981/$799F/$79D8
}

/** ROM: loc_01_50C3, table 1:$50D3, indexed on state-1. */
export function primaryDispatch(state, r) {
  switch (r[E_STATE]) {
    case 1: return stWalker(state, r);              // 1:$50ED
    case 2: return stWalkerJump(state, r);          // 1:$5399
    case 3: return stFlyer(state, r);               // 1:$55AA
    case 4: return stChaser(state, r);              // 1:$7750
    case 5: return stL6Vehicle(state, r);           // 1:$575C
    case 6: return stL12(state, r);                 // 1:$57D6
    case 7: return stBoss2(state, r);               // 1:$6D8A
    case 8: return stBoss3(state, r);               // 1:$7061
    case 9: return stBoss4(state, r);               // 1:$7288
    case 0x0A: return stBoss1(state, r);            // 1:$7591
    case 0x0B: return stProjectile(state, r);       // 1:$59E0
    case 0x0C: return stDormant(state, r);          // 1:$5B95
    case 0x0D: return stBoss2Part(state, r);        // 1:$78A7
    // NOTE: no screenTail here, so an enemy in one of the unported states
    // keeps STALE +7/+8 screen bytes indefinitely -- and both hit scans now
    // compare against exactly those. The old world-space tests were immune to
    // this. Latent (boss levels only) until states 4-9/13 land.
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
export function stunnedTick(state, r) {
  if (r[0x17] === 0) return stunExpired(state, r);  // $4F27
  const t = u8(r[0x17] - 1);
  r[0x17] = t;
  if (t < 0x3A) {                                   // $4F2E -> loc_01_503D
    if (r[E_FLAGS] & 0x18) return hitDispatch(state, r);
    return primaryDispatch(state, r);
  }
  const st = r[E_STATE];                            // $4F35
  if (st === 5) {                                   // $4F7C: vehicle target
    r[E_FLAGS] &= 0xC5;
    return primaryDispatch(state, r);
  }
  if (st === 7 || st === 9 || st === 0x0A) return bossKnockback(state, r); // $4F84
  if (st === 8) return boss3Knockback(state, r);    // $4FF5
  // $4F4B: walkers / flyers / projectiles bounce up and away from the player.
  r[0x13] = 0x18;
  r[E_VX] = playerScreenX(state) >= r[E_SCREEN_X] ? 0xF0 : 0x10;   // $4F59
  r[E_FLAGS] = (r[E_FLAGS] & 0xC5) | 0x01;          // $4F6A: rising
  r[1] &= 0x9F;                                     // $4F70
  // $4F76: $C73F (boss-3 helper flag) = 0 -- not modelled.
  return primaryDispatch(state, r);
}

/** ROM: loc_01_4F84 - bosses 2/4/L14-chaser knockback (+ hard-mode counter). */
export function bossKnockback(state, r) {
  r[0x13] = 0x10;
  const xhi = r[E_X_HI];                            // $4F91: arena walls
  if (xhi === 0x0A) r[E_VX] = 0xF0;
  else if (xhi === 0x01) r[E_VX] = 0x10;
  else r[E_VX] = playerScreenX(state) >= r[E_SCREEN_X] ? 0xF0 : 0x10;
  r[E_FLAGS] = (r[E_FLAGS] & 0xC5) | 0x01;
  r[1] &= 0x9F;
  // $4FCA: the knockback cancels the $C741 spin/patience counter. Verified
  // by l8-boss2-batarang-spin: a punch landing mid-spin zeroes it instantly
  // on the cartridge (f138), it does not run down.
  state.flow.bossHop = 0;
  if (state.flow.difficulty === 2) {                // $4FCD: retaliate on hard
    r[E_FLAGS] |= 0x08;
    r[E_FACING] = playerScreenX(state) < r[E_SCREEN_X] ? 1 : 0;     // $4FDE
    r[0x14] = 0x1F;                                 // $4FED
  }
  return primaryDispatch(state, r);
}

/** ROM: loc_01_4FF5 - boss 3 variant (X hi >= 9 counts as the right wall). */
export function boss3Knockback(state, r) {
  r[0x13] = 0x10;
  const xhi = r[E_X_HI];
  if (xhi >= 0x09) r[E_VX] = 0xF0;                  // $5003
  else if (xhi === 0x01) r[E_VX] = 0x10;
  else r[E_VX] = playerScreenX(state) >= r[E_SCREEN_X] ? 0xF0 : 0x10;
  r[E_FLAGS] = (r[E_FLAGS] & 0xC5) | 0x01;
  r[1] &= 0x9F;
  return primaryDispatch(state, r);
}

/** ROM: loc_01_5049 - the stun timer just expired. */
export function stunExpired(state, r) {
  const bid = state.level.bossId;                   // $C73E
  if (bid === 2 || bid === 4) {                     // $505A
    r[E_FACING] = playerScreenX(state) < r[E_SCREEN_X] ? 1 : 0;
    r[E_FLAGS] = (r[E_FLAGS] & 0xC3) | 0x10;
    r[0x14] = 0x1F;
    return riseTail(state, r);
  }
  if (bid === 3) {                                  // $5080
    r[0x14] = 0x1F;
    r[E_FACING] = playerScreenX(state) < r[E_SCREEN_X] ? 1 : 0;     // $508E (SUB-based, same test)
    r[E_VX] = (r[E_FACING] & 1) ? 0xCC : 0x34;      // $50A1
    r[E_FLAGS] = (r[E_FLAGS] & 0xC3) | 0x08;
    // $50B0: the retaliation IS the crit lunge -- attackTickBoss3 reads this
    // and runs the decaying-velocity dash. Verified by l11-boss3-punch: the
    // f188 divergence before this write was modelled was exactly bossCrit,
    // and the observed vx $CD is $CC plus one $6280 increment.
    state.flow.bossCrit = 1;
    requestSound(state, 0x2D);
    return primaryDispatch(state, r);               // $50BB
  }
  r[E_FLAGS] &= ~0x04;                              // $50C1
  return primaryDispatch(state, r);
}

/** ROM: loc_01_60DD, table 1:$60EF -- runs while bits 3/4 (attack) are set. */
export function hitDispatch(state, r) {
  switch (r[E_STATE]) {
    case 1: case 4: case 0x0B: return attackTickBasic(state, r);   // jt_01_6107
    case 2: return attackTickWalkerJump(state, r);                 // jt_01_612E
    case 3: return attackTickFlyer(state, r);                      // jt_01_6169
    case 5: return attackTickL6(state, r);                         // jt_01_6398
    case 6: return attackTickL12(state, r);                        // jt_01_61B3
    case 7: return attackTickBoss2(state, r);                      // jt_01_61DD
    case 8: return attackTickBoss3(state, r);                      // jt_01_621F
    case 9: return attackTickBoss4(state, r);                      // jt_01_6300
    case 0x0A: return attackTickBoss1(state, r);                   // jt_01_634F
    case 0x0C: return attackTickDormant(state, r);                 // jt_01_637F
    default: return;
  }
}

/** ROM: jt_01_6107 - hold the attack pose, probing the player every frame. */
export function attackTickBasic(state, r) {
  if (r[0x14] !== 0) {
    r[0x14]--;
    attackProbe(state, r);                          // $6118 -> sub_01_6616
    return riseTail(state, r);
  }
  state.flow.bossCrit = 0;                          // $6121: $C73F = 0
  r[E_FLAGS] &= 0xC7;
  return riseTail(state, r);
}
