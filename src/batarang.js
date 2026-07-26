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

  b.active = true;
  b.flags = p.facing + 1;                    // $19CE: facing+1, 1 = right
  b.x = p.x;                                 // $19D3/$19D6

  // $19E0: BIT 7 = Down held.
  b.y = u16(p.y + ((held & 0x80) ? 0x0060 : -0x0040));

  b.speed = t.batarangSpeed;                 // $19F6: $50
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
    if (b.flags & FLAG_RETURNING) catchTest(state, b);
  }
}

/** ROM: $3C0B - sub_00_0C88 with HL = $0C10, a 12 x 16 overlap box. */
function catchTest(state, b) {
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
// keeps that bit until the comparison flips, which is what makes the return
// leg a damped oscillation rather than a snap.
const F_RIGHT = 0x01, F_LEFT = 0x02, F_DOWN = 0x04, F_UP = 0x08;
const VEL_CAP_POS = 0x40;     // $3A9C / $3B0D
const VEL_CAP_NEG = 0xC0;     // $3ABC / -64

/** Accelerate a velocity byte by +2, capped. ROM: $3A9A / $3B0B. */
const accelPos = (v) => Math.min(v + 2, VEL_CAP_POS);
/** Accelerate by -2 in wrapped byte space, clamped at $C0. ROM: $3ABA. */
function accelNeg(v) {
  const a = (v - 2) & 0xFF;
  return a >= VEL_CAP_NEG ? a : VEL_CAP_NEG;   // unsigned CP $C0 / JR NC
}
const sv = (v) => (v << 24) >> 24;             // velocity bytes are signed

/**
 * ROM: the bit-7 branch at $3A5C.
 *
 * Two independent axes, each comparing the batarang's HIGH byte against the
 * player's and accelerating a velocity toward it. The Y target is the player's
 * row MINUS ONE ($3A78: DEC A) -- the batarang returns to chest height, not to
 * the origin.
 */
function updateReturning(state, b) {
  const p = state.player;

  // --- Y axis ($3A65-$3ACC) ---
  const batYhi = b.y >> 8;
  const tgtY = ((p.y >> 8) - 1) & 0xFF;        // $3A76/$3A78
  let dirY;
  if (tgtY === batYhi) {                       // $3A81: hold the current bias
    dirY = (b.flags & F_DOWN) ? 'down' : (b.flags & F_UP) ? 'up' : null;
  } else {
    dirY = tgtY < batYhi ? 'up' : 'down';      // $3A7D: JR C -> move up
  }
  if (dirY === 'down') {                       // $3A8C
    b.flags = (b.flags & ~F_UP) | F_DOWN;
    b.arc = accelPos(b.arc & 0x80 ? sv(b.arc) : b.arc);
    b.y = u16(b.y + sv(b.arc));
  } else if (dirY === 'up') {                  // $3AA9
    b.flags = (b.flags & ~F_DOWN) | F_UP;
    b.arc = accelNeg(b.arc);
    b.y = u16(b.y + sv(b.arc));
  }

  // --- X axis ($3AD1-$3B20) ---
  const batXhi = b.x >> 8;
  let dirX;
  if (batXhi >= 0xA0) {                        // $3AD4: off-map guard
    dirX = 'right';
  } else {
    const tgtX = p.x >> 8;                     // $3AE9
    if (tgtX === batXhi) {                     // $3AF2
      dirX = (b.flags & F_RIGHT) ? 'right' : (b.flags & F_LEFT) ? 'left' : null;
    } else {
      dirX = tgtX < batXhi ? 'left' : 'right'; // $3AEE: JR C -> move left
    }
  }
  if (dirX === 'right') {                      // $3AFE
    b.flags = (b.flags & ~F_LEFT) | F_RIGHT;
    b.speed = accelPos(b.speed & 0x80 ? sv(b.speed) : b.speed);
    b.x = u16(b.x + sv(b.speed));
  } else if (dirX === 'left') {                // $3B1E
    b.flags = (b.flags & ~F_RIGHT) | F_LEFT;
    b.speed = accelNeg(b.speed);
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
