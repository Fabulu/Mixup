// Batarang pool.  ROM: throw at loc_00_19BE, flight at sub_00_3A35.
//
// Three 9-byte slots at $C4B0 (indexed $C4A7 + 9*(n+1)):
//   +0 flags   b7 = returning, low nibble = facing + 1 (1 = right, 2 = left)
//   +1/+2 X    world 12.4, hi/lo
//   +3/+4 Y    world 12.4, hi/lo
//   +5 speed   decays by 2 per frame; reaching 0 starts the return
//   +6 arc     $40 when Up was held at throw time
//   +7/+8      screen X/Y, recomputed each frame for drawing

import { u16 } from './state.js';
import { cameraPixels } from './camera.js';
import { drawMetasprite } from './render/metasprite.js';
import { c740Idle } from './effects.js';

export const POOL_SIZE = 3;
export const FLAG_RETURNING = 0x80;

export function createPool() {
  return Array.from({ length: POOL_SIZE }, () => ({
    active: false, flags: 0, x: 0, y: 0, speed: 0, arc: 0,
    screenX: 0, screenY: 0,
  }));
}

/** ROM: $199A-$19AB. First free slot, or -1. */
export function findFreeSlot(pool) {
  for (let i = 0; i < POOL_SIZE; i++) if (!pool[i].active) return i;
  return -1;
}

/**
 * ROM: loc_00_19BE. Populate a slot from the player's current state.
 *
 * Spawn height depends on the d-pad: holding Down spawns +$60 BELOW the
 * player's origin, otherwise -$40 above it. Holding Up additionally sets the
 * arc flag.
 */
export function throwBatarang(state, slot) {
  const p = state.player;
  const b = state.batarangs[slot];
  const t = state.tunables;
  const held = state.input.held;

  // $19C0-$19CC: on LEVEL 14, and only off EASY, the throw sets bit 7 -- the
  // RETURNING flag -- before the batarang has gone anywhere. So the Joker
  // fight's batarangs never have an outbound leg at all: they start on the
  // return path and, with the $3A6B/$3ADE/$3BF5 retarget below, home on the
  // CHASER rather than on Batman. Default difficulty is 1, so this is the
  // ordinary experience of the final fight, not an edge case.
  const jokerThrow = jokerSeek(state);

  b.active = true;
  b.flags = (p.facing + 1) | (jokerThrow ? 0x80 : 0);   // $19CE: OR B
  b.x = p.x;                                 // $19D3/$19D6

  // $19E0: BIT 7 = Down held.
  b.y = u16(p.y + ((held & 0x80) ? 0x0060 : -0x0040));

  // $19F6 loads $50, then $19F8-$1A04 replaces it with 8 under the same
  // level-14/non-easy test. A slow seeker, not a thrown weapon.
  b.speed = jokerThrow ? 0x08 : t.batarangSpeed;        // $19F6 / $1A04
  b.arc = (held & 0x40) ? 0x40 : 0;          // $1A08: BIT 6 = Up held
  b.screenX = 0;
  b.screenY = 0;
}

/**
 * ROM: sub_00_3A35. One update pass over the pool.
 *
 * Outbound: X advances by the current speed, and the SPEED ITSELF decays by 2
 * every frame ($3B9A: SUB $02). When it reaches zero the slot flips into the
 * returning phase rather than despawning.
 */
export function updateBatarangs(state) {
  if (state.flow.paused) return;             // $3A50: $C716

  for (const b of state.batarangs) {
    if (!b.active) continue;                 // $3A4B

    if (b.flags & FLAG_RETURNING) {
      updateReturning(state, b);
    } else {
      updateOutbound(state, b);
    }

    // $3BD1: the world->screen conversion happens BEFORE the catch test, and
    // the test uses those fresh coordinates. Testing against the previous
    // frame's screen position instead makes the catch land two frames late.
    updateScreenPos(state, b);

    // $3BE9: order matters -- a RETURNING batarang runs the catch test FIRST
    // ($3C0B) and, if caught, is cleared on the spot ($3D40) and never reaches
    // the enemy scan that frame. Hit-testing before the catch dealt damage on
    // the catch frame that the cartridge never deals.
    if (b.flags & FLAG_RETURNING) {
      catchTest(state, b);
      if (!b.active) continue;
    }
    batarangHitTest(state, b);          // $3C17
  }
}

/**
 * A batarang in flight hits an enemy.  ROM: loc_00_3C17-$3D14, all 8 slots,
 * every flight frame, outbound AND returning.
 *
 * The test is in SCREEN space: the batarang's cached +7/+8 (recomputed at
 * $3BD1 just before this) against the enemy's cached +7/+8 (one frame stale,
 * written by the last enemy-driver pass), through sub_00_0C88 with a $1216
 * box -- and $0C88's compares are INCLUSIVE (`JR Z` accepts equality),
 * unlike the melee scan's strict ones. The old world-space version was
 * close, but compared the enemy's CURRENT position -- half a frame ahead of
 * what the cartridge sees -- and skipped every state check around the box:
 *
 *   - states 4/$0B/$0D are immune ($3C79-$3C85): a batarang cannot shoot
 *     down an enemy projectile ($0B);
 *   - states 2/7/$0A are ARMORED ($3C6F-$3C77 -> $3C8A): sound $1D, no
 *     damage; the enemy turns away and enters its attack state (bit 3 + a
 *     timer), and the batarang BOUNCES home with forced velocities;
 *   - everything else is the damage arm at $3CF4: skip if already flashing
 *     (BIT 2), else sound $19, hit-flash, $3C stun, and 1 damage -- the DEC
 *     at $3D0B fires only if HP was non-zero. The batarang flies on.
 *
 * $C740 must be $FF exactly as in the melee scan (level 14's init writes 1).
 */
function batarangHitTest(state, b) {
  const t = state.tunables;
  // $3C56: the Joker is immune while he is STAGGERING. stBoss4 runs $C73D
  // down from $EF, so `>= 2` holds for about 238 frames after each stagger
  // and everything thrown at him in that window does nothing. The same gate
  // heads the melee scan at $2643.
  if (state.level.bossId === 4 && state.flow.bossRage >= 2) return;
  // $3BD1 / sub_00_1172 convention: +8/+16 OAM offsets, u8 wrap. b.screenX
  // holds the drawing convention, so derive the ROM pair from world space.
  const { x: bsx, y: bsy } = romScreenPair(state, b);

  for (const r of state.enemies) {
    if ((r[0] & 0x80) === 0 || (r[0] & 0x40) !== 0) continue;   // $3C27/$3C2C

    // $3C43: sub_00_0C88, box 18 x 22, inclusive on both axes.
    if (absDiff8(r[7], bsx) > 0x12) continue;
    if (absDiff8(r[8], bsy) > 0x16) continue;

    // $3C4E: `LD A,[$C740] / CP $FF / JP NZ` -- the same gate the melee scan
    // has at $26B7, on the same byte, and it is NOT $C750. See enemies.js: a
    // boss dying stamps $C740 = $FE and the countdown holds it non-$FF for 255
    // frames of ordinary, controllable play in which a thrown batarang is inert.
    if (!c740Idle(state)) continue;

    const st = r[2];
    if (st === 0x04 || st === 0x0B || st === 0x0D) continue;    // immune

    let armoredDamage = false;                       // the $3C9E exception
    if (st === 0x02 || st === 0x07 || st === 0x0A) { // $3C8A: armored bounce
      requestSound(state, 0x1D);
      if ((r[0] & 0x08) === 0) {                     // $3C90: not already hit
        if (state.level.bossId === 2) {              // $3C94: boss 2 splits
          if (r[0] & 0x03) {
            // $3C9E: an AIRBORNE boss 2 takes the ordinary damage arm --
            // the armor only works grounded. No bounce in this case.
            armoredDamage = true;
          } else {
            state.flow.bossHop = 0x1E;               // $3CA2: the $C741 spin
          }
        } else {
          r[0] |= 0x08;                              // $3CA7: attack state
          if (state.level.bossId === 1) {            // $3CB0
            state.flow.bossCrit = 1;                 // $3CB6: $C73F -- reads
            r[0x14] = 0x10;                          // back as the close-in
          } else {                                   // $12 probe offset
            r[0x14] = 0x1F;                          // $3CBD
          }
        }
      }
      if (!armoredDamage) {
        r[5] = (((b.flags & 0x03) ^ 0x03) - 1) & 0xFF; // $3CC9: face away
        b.flags = (b.flags ^ 0x0F) | 0x80;             // $3CD1: flip + return
        b.speed = (b.flags & 0x01) ? 0x40 : 0xC0;      // $3CDB
        b.arc = (b.flags & 0x04) ? 0xC0 : 0x40;        // $3CE7
        continue;                                      // $3CF2 -> next slot
      }
    }

    if (r[0] & 0x04) continue;                       // $3CF4: already flashing
    requestSound(state, 0x19);                       // $3CF8
    r[0] |= 0x04;                                    // $3CFE
    r[0x17] = t.enemyStunFrames;                     // $3D04: $3C
    if (r[0x16] !== 0) r[0x16]--;                    // $3D07/$3D0B
  }
}

/** ROM: sub_00_0AE1 -- the same four-slot ring the player code feeds. */
function requestSound(state, id, mask = 0x01) {
  if (state.sound && state.sound.queue.length < 4) {
    state.sound.queue.push({ id, mask });
  }
}

/** 8-bit |a-b|, the SUB / JR NC / CPL / INC A idiom. */
function absDiff8(a, b) {
  return (a & 0xFF) >= (b & 0xFF) ? (a - b) & 0xFF : (b - a) & 0xFF;
}

/**
 * `CP $0E` then `$C756 != 0` -- the level-14 arm, written out once because the
 * ROM tests it in THREE separate places for three separate swaps and they must
 * agree: $19C0 (throw sets bit 7 + speed 8), $3A65/$3AD1 (home on the chaser),
 * $3BF1 (the chaser, not Batman, catches it). Splitting them is how the
 * regression happened -- the throw arm was ported without the catch arm.
 */
function jokerSeek(state) {
  return state.level.number === 0x0E && state.flow.difficulty !== 0;
}

/**
 * ROM: sub_00_1172, the pair cached at record +7/+8 -- the +8/+16 OAM offsets
 * over world-minus-camera, u8 wrapped. Enemy records hold their pair in this
 * same convention, so anything compared against r[7]/r[8] must use this and
 * NOT the bare drawing pair updateScreenPos stores.
 */
function romScreenPair(state, b) {
  return {
    x: (((u16(b.x - state.camera.x) >> 4) + 8) & 0xFF),
    y: (((u16((b.y & 0x0FFF) - state.camera.y) >> 4) + 0x10) & 0xFF),
  };
}

/**
 * ROM: $3BED-$3C14 - sub_00_0C88 with HL = $0C10, a 12 x 16 overlap box.
 *
 * WHO CATCHES IT IS NOT ALWAYS BATMAN. $3BF5 swaps the target pair for
 * $C28F/$C290 -- enemy slot 1's cached screen coords, the CHASER -- under the
 * same level-$0E/non-easy test that swaps the homing target. So the Joker
 * fight's batarang is a slow seeker that flies to the chaser and is ABSORBED
 * by it; the player never catches one.
 *
 * MEASURED (tools/oracle/jokerbat.py, normal difficulty, throw at f740): the
 * pair the ROM loads into B/C equals $C28F/$C290 on all 25 frames of flight
 * and never equals $FF93/$FF94, and the throw lives f740-f764 travelling from
 * screen ($10,$7B) to the chaser at ($47,$40).
 *
 * Testing the PLAYER here regressed level 14 to "no batarang ever appears":
 * the throw spawns at the player's own X and $40 above him, i.e. inside the
 * catch box, so with bit 7 already set at throw time every batarang was caught
 * and its slot freed on its first frame -- ammo spent, nothing drawn.
 */
function catchTest(state, b) {
  if (jokerSeek(state)) {
    // $C28F/$C290 are enemy slot 1's +7/+8. Those come from sub_00_1172 and so
    // carry the +8/+16 OAM offsets (MEASURED: jokerbat.py's convention table
    // matches +8/+16 on every frame and the bare drawing pair on none) -- the
    // batarang side must be the same pair the hit test builds, not the
    // drawing-convention screenX/screenY.
    const chaser = state.enemies[1];
    const { x: bsx, y: bsy } = romScreenPair(state, b);
    if (absDiff8(chaser[7], bsx) <= 0x0C && absDiff8(chaser[8], bsy) <= 0x10) {
      b.active = false;
      b.flags = 0;
    }
    return;
  }

  const p = state.player;
  const cam = cameraPixels(state);
  const px = (p.x >> 4) - cam.x;                      // $FF93
  const py = ((p.y >> 4) - 0x100) - cam.y;            // $FF94

  // Bounds are INCLUSIVE: measured against the ROM, the catch fires at exactly
  // 12 px of separation, so `< 12` despawns one frame late.
  if (Math.abs(b.screenX - px) <= 0x0C && Math.abs(b.screenY - py) <= 0x10) {
    b.active = false;
    b.flags = 0;
  }
}

/** ROM: loc_00_3B8F (right, flags == 1) / loc_00_3BAB (left, flags == 2). */
function updateOutbound(state, b) {
  const next = b.speed - 2;                  // $3B9A / $3BB0
  if (next <= 0) {
    // $3BC8: speed hits zero -> start the return leg. The slot stays live.
    b.speed = 0;
    b.flags |= FLAG_RETURNING;               // $3BCE: SET 7
    return;
  }
  b.speed = next;                            // $3BA0 / $3BB6

  // $3BC0: 16-bit add of the signed speed into X.
  const dx = (b.flags & 0x0F) === 2 ? -next : next;
  b.x = u16(b.x + dx);
}

// Direction-hysteresis bits in slot+0. Once an axis starts moving one way it
// keeps that bit until the comparison flips.
const F_RIGHT = 0x01, F_LEFT = 0x02, F_DOWN = 0x04, F_UP = 0x08;
const VEL_CAP_POS = 0x40;     // $3A9C / $3B0D
const VEL_CAP_NEG = 0xC0;     // $3ABC / -64

// Velocity bytes are stored UNSIGNED here, exactly as the ROM keeps them, and
// only widened when they are added to a position. Letting them go negative in
// JS breaks the `& 0x80` sign tests these four helpers are selected by.
const sv = (v) => (v << 24) >> 24;

/** Accelerate by +2, capped at +64. ROM: $3A9A / $3B0B. */
const accelPos = (v) => Math.min((v + 2) & 0xFF, VEL_CAP_POS);
/** Accelerate by -2 in byte space, floored at -64. ROM: $3ABA / $3B2E. */
function accelNeg(v) {
  const a = (v - 2) & 0xFF;
  return a >= VEL_CAP_NEG ? a : VEL_CAP_NEG;   // unsigned CP $C0 / JR NC
}

// Braking -- the velocity currently points the WRONG way. ROM: $3B52 / $3B79
// (rightward/downward) and $3B41 / $3B6B (leftward/upward).
//
// This is the shape of the whole return leg: braking is 4 per frame, twice the
// acceleration, and it STOPS DEAD at zero instead of crossing. That is what
// makes the real batarang come back in one clean sweep. Accelerating through
// zero at 2 instead turns the return into a long visible zigzag, because the
// target row only changes every 16 px while the velocity keeps overshooting.
const brakePos = (v) => (v + 4 > 0xFF ? 0 : v + 4);   // ADD $04 / JR NC
const brakeNeg = (v) => (v >= 4 ? v - 4 : 0);         // SUB $04 / JR NC

/**
 * ROM: the bit-7 branch at $3A5C.
 *
 * Two independent axes, each comparing the batarang's HIGH byte against the
 * player's and steering a velocity toward it. The Y target is the target's row
 * MINUS ONE ($3A78: DEC A, on BOTH paths) -- the batarang returns to chest
 * height, not to the origin.
 *
 * ON LEVEL $0E ABOVE EASY IT DOES NOT COME BACK TO YOU. $3A6B and $3ADE swap
 * the targets for $C298 and $C296 -- enemy slot 1's Y hi and X hi, the chaser.
 * Together with the throw setting bit 7 immediately and the speed dropping to
 * 8, the final fight's batarangs are slow seekers seeking the BOSS. Default
 * difficulty is 1, so this is how the fight normally plays.
 */
function homingTarget(state) {
  // $3A65/$3AD1: CP $0E, then $C756 != 0.
  if (jokerSeek(state)) {
    const chaser = state.enemies[1];
    return { xhi: chaser[0x0E], yhi: chaser[0x10] };   // $C296 / $C298
  }
  return { xhi: state.player.x >> 8, yhi: state.player.y >> 8 };
}

function updateReturning(state, b) {
  const tgt = homingTarget(state);

  // --- Y axis ($3A65-$3ACC) ---
  const batYhi = b.y >> 8;
  const tgtY = (tgt.yhi - 1) & 0xFF;           // $3A76/$3A78
  let dirY;
  if (tgtY === batYhi) {                       // $3A81: hold the current bias
    dirY = (b.flags & F_DOWN) ? 'down' : (b.flags & F_UP) ? 'up' : null;
  } else {
    dirY = tgtY < batYhi ? 'up' : 'down';      // $3A7D: JR C -> move up
  }
  if (dirY === 'down') {                       // $3A8C
    b.flags = (b.flags & ~F_UP) | F_DOWN;
    // $3A95: already heading up? brake instead of accelerating.
    b.arc = (b.arc & 0x80) ? brakePos(b.arc) : accelPos(b.arc);
    b.y = u16(b.y + sv(b.arc));
  } else if (dirY === 'up') {                  // $3AA9
    b.flags = (b.flags & ~F_DOWN) | F_UP;
    // $3AB2: zero accelerates; a positive value is heading down, so brake.
    b.arc = (b.arc !== 0 && !(b.arc & 0x80)) ? brakeNeg(b.arc) : accelNeg(b.arc);
    b.y = u16(b.y + sv(b.arc));
  }

  // --- X axis ($3AD1-$3B20) ---
  const batXhi = b.x >> 8;
  let dirX;
  if (batXhi >= 0xA0) {                        // $3AD4: off-map guard
    dirX = 'right';
  } else {
    const tgtX = tgt.xhi;                      // $3AE9 / $3AE3
    if (tgtX === batXhi) {                     // $3AF2
      dirX = (b.flags & F_RIGHT) ? 'right' : (b.flags & F_LEFT) ? 'left' : null;
    } else {
      dirX = tgtX < batXhi ? 'left' : 'right'; // $3AEE: JR C -> move left
    }
  }
  if (dirX === 'right') {                      // $3AFE
    b.flags = (b.flags & ~F_LEFT) | F_RIGHT;
    b.speed = (b.speed & 0x80) ? brakePos(b.speed) : accelPos(b.speed);   // $3B07
    b.x = u16(b.x + sv(b.speed));
  } else if (dirX === 'left') {                // $3B1E
    b.flags = (b.flags & ~F_RIGHT) | F_LEFT;
    b.speed = (b.speed !== 0 && !(b.speed & 0x80))                        // $3B27
      ? brakeNeg(b.speed) : accelNeg(b.speed);
    b.x = u16(b.x + sv(b.speed));
  }
}

/**
 * ROM: loc_00_3D15. Draw every live batarang.
 *
 * The metasprite is picked from an 8-entry spin table at 0:$41B8, indexed by
 * (frame & $1C) >> 2 -- so all batarangs share one global spin phase rather
 * than each animating independently. It freezes while paused.
 */
export function drawBatarangs(state, manifest) {
  // A mod may swap the spin cycle for any metasprite ids it likes.
  const table = state.video.batarangAnim
    || (state.tables && state.tables.batarangAnim);
  if (!table) return;

  const phase = state.flow.paused ? 0 : (state.frame & 0x1C) >> 2;   // $3D2A
  const id = table[phase];
  if (id === undefined) return;

  for (const b of state.batarangs) {
    if (!b.active) continue;
    // $3D21: B/C come from the record's stored screen coords (+7/+8).
    drawMetasprite(state, manifest.metasprites.table1, id,
                   b.screenX, b.screenY, 0);
  }
}

/** ROM: $3BD1 - world -> screen via sub_00_1172, stored at +7/+8. */
function updateScreenPos(state, b) {
  const cam = cameraPixels(state);
  b.screenX = (b.x >> 4) - cam.x;
  b.screenY = ((b.y >> 4) - 0x100) - cam.y;
}
