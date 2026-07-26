// Enemy array -- $C268.  ROM: driver sub_01_4E0C, dispatch 1:$50D3.
//
// 8 slots x 32 bytes, preloaded whole at level init from a bank-5 blob that is
// a byte-identical image of the RAM records. There is no streaming spawner and
// no pooling: the whole roster for a level exists from the moment it loads,
// dormant until the camera comes near. The entire game ships 26 non-boss
// enemies and 5 boss entities.
//
// Record layout (master reference §5.2):
//   +0        flags: b7 active, b6 permanently disabled, b3 hit-player,
//             b2 hit-flash
//   +2        STATE = the enemy type, 1-13 -> dispatch 1:$50D3
//   +5        facing / knockback direction
//   +6        kill latch
//   +7/+8     screen X / Y
//   +$0A-$0D  hitbox half-width pair / half-height pair
//   +$0E/+$0F X world 12.4
//   +$10/+$11 Y world 12.4
//   +$14      state timer
//   +$16      HP
//   +$17      hit-flash / stun timer

import { u8 } from './state.js';

export const SLOTS = 8;
export const RECORD = 32;

const F_ACTIVE = 0x80, F_DISABLED = 0x40;

/** Camera-relative windows. ROM: $60A9 (activate), sub_00_11A7 (despawn). */
const ACTIVATE_RANGE = 7;
const DESPAWN_RANGE = 9;
const DEATH_ROW = 0x21;

/**
 * The 13 state handlers at 1:$50D3, none of them ported yet. Each is a full
 * AI -- state 2 alone (the walking/jumping grunt) is over 500 bytes and tracks
 * the player's screen X through several distance bands. Listing them keeps the
 * gap explicit rather than silently inert.
 *
 *   1 $50ED walker (L1-3)      8 $7061 BOSS 3 (L11)
 *   2 $5399 walker+jump        9 $7288 BOSS 4 Joker (L14)
 *   3 $55AA flyer (L9,10)     10 $7591 BOSS 1 (L4)
 *   4 $7750 L14 chaser        11 $59E0 boss projectile
 *   5 $575C L6 vehicle        12 $5B95 dying/despawn
 *   6 $57D6 L12 enemy         13 $78A7 boss-2 parts
 *   7 $6D8A BOSS 2 (L8)
 */
export const UNIMPLEMENTED_STATES = new Set(
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);

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

/**
 * ROM: sub_01_4E0C.
 *
 * The loop direction alternates with frame parity ($FFA7): even frames walk
 * slots 0->7, odd frames 7->0. That is not cosmetic -- it decides which enemy
 * wins when two would act on the same thing in one frame.
 */
export function updateEnemies(state) {
  if (state.flow.bossMode) return;                  // $4E0C: $C750 -> 1:$77BD

  const descending = state.parity !== 0;            // $4E13
  for (let n = 0; n < SLOTS; n++) {
    const slot = descending ? SLOTS - 1 - n : n;
    state.enemyCursor = slot;                       // $FFB3
    const r = state.enemies[slot];

    if ((r[0] & F_ACTIVE) === 0) { tryActivate(state, r); continue; }   // $4E27
    if (state.flow.paused || state.lagFrame) continue;                  // $4E2C/$4E39

    if (shouldDespawn(state, r)) {                  // $4E4D -> sub_00_11A7
      r[0] &= ~F_ACTIVE;                            // $4E55: RES 7
      continue;
    }

    r[9] = 0;                                       // $4E60
    if (r[0x10] >= DEATH_ROW) { kill(state, r); continue; }   // $4E69: fell out
    if (r[0x16] === 0) { kill(state, r); continue; }          // $4E75: HP gone

    dispatch(state, r);

    // Contact only runs for states whose AI is actually ported. A stationary
    // enemy (no state handler) sits at its spawn position forever, so testing
    // contact against it damages the player at times the real game never
    // would -- worse than not testing at all, and it corrupts the trace with
    // no fidelity gain. This re-enables itself per state as handlers land.
    if (!UNIMPLEMENTED_STATES.has(r[2])) contactPlayer(state, r);
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
  if (Math.abs(camCol - xhi) >= ACTIVATE_RANGE) return;   // $60A9
  if (r[0] & F_DISABLED) return;                    // $60AF: BIT 6

  if (r[1] === 0x01) {                              // $60B5
    // $60BC: only when the enemy's column equals camera - 2, exactly.
    if (xhi !== u8((state.camera.x >> 8) - 2)) return;
  }
  r[0] |= F_ACTIVE;                                 // $60C5: SET 7
}

/** ROM: sub_00_11A7 - the despawn window is wider than the activation one. */
function shouldDespawn(state, r) {
  const camCol = u8((state.camera.x >> 8) + 5);
  if (Math.abs(camCol - r[0x0E]) >= DESPAWN_RANGE) return true;
  return r[0x10] >= DEATH_ROW;
}

function kill(state, r) {
  r[0] &= ~F_ACTIVE;
  r[0] |= F_DISABLED;                               // stays dead for the level
}

function dispatch(state, r) {
  // 1:$50D3, indexed on state-1. Nothing ported yet; see UNIMPLEMENTED_STATES.
  void r;
}

/**
 * Enemy touches player.  Damage comes from 1:$6BC1 indexed by STATE, and when
 * that entry has bit 7 set a per-level bonus from 1:$6BCE is added on top --
 * which is how the same grunt hurts more in later stages.
 */
function contactPlayer(state, r) {
  const p = state.player;
  const t = state.tables;

  if (p.iframes !== 0 || p.dead) return;

  const px = p.x >> 4, py = p.y >> 4;
  const ex = (((r[0x0E] << 8) | r[0x0F]) & 0xFFFF) >> 4;
  const ey = (((r[0x10] << 8) | r[0x11]) & 0xFFFF) >> 4;
  if (Math.abs(ex - px) > p.halfW || Math.abs(ey - py) > p.halfH) return;

  const stateId = r[2];
  let dmg = t.enemyContactDamage[stateId] ?? 0;
  if (dmg & 0x80) {
    dmg = (dmg & 0x7F) + (t.levelDamageBonus[state.level.number - 1] ?? 0);
  }
  if (dmg === 0) return;

  r[0] |= 0x08;                                     // hit-player flag
  p.hp = Math.max(0, p.hp - dmg);
  // Facing right stamps the knockback-left bit; see loc_00_1780.
  p.iframes = p.facing === 0
    ? (state.tunables.invulnFrames | 0x80)
    : state.tunables.invulnFrames;
}
