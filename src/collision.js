// Collision probing.  ROM: sub_00_20BA (core), $1DB9 floor, $1EA6 ceiling,
// $1EF9 horizontal, addressing sub_00_11B9.

import {
  mapCollision, setMapCollision, setMapCell, mapCollisionByIndex, cellIndex,
  u8, u16,
} from './state.js';
import { armScriptedMove } from './scriptedmove.js';

/** Probe modes, as written to $C72B. */
export const MODE_HORIZONTAL = 1;
export const MODE_CEILING = 3;
export const MODE_FLOOR = 4;
export const MODE_PUNCH = 5;

/** Collision byte values (master reference §6.3). */
export const COLL = {
  AIR: 0x00,
  SOLID: 0x01,
  CONVEYOR_R: 0x02,
  CONVEYOR_L: 0x03,
  EXIT: 0x04,
  TRIGGER: 0x05,
  BREAKABLE: 0x06,
  SOLID2: 0x07,
  WATER: 0x08,
  SOLID_STEP: 0x09,
  DOOR: 0x1F,        // low 5 bits; high 3 bits = owning $C1E8 slot
  PICKUP_ENERGY: 0x20,
  PICKUP_AMMO: 0x21,
  PICKUP_MAXHP: 0x22,
  SPIKE: 0xFD,
  SOLID_RUNTIME: 0xFF,
};

/** Values that stop a fall and are stood on. ROM: the $1E35 arms of $1DB9. */
const LANDABLE = new Set([
  COLL.SOLID, COLL.TRIGGER, COLL.SOLID2, COLL.SOLID_RUNTIME,
]);

/**
 * ROM: sub_00_20BA.  Reads the collision byte at (player position + offset).
 *
 * @param dxSub  X offset in subpixels (the original's DE)
 * @param dySub  Y offset in subpixels (the original's BC)
 * @returns {{value:number, col:number, row:number, subX:number}}
 *          value 0 when the probe leaves the world vertically.
 */
export function probe(state, dxSub, dySub) {
  const p = state.player;

  // $20BA-$20C7: probe Y first; bail out if below the world.
  const py = (p.y + dySub) & 0xFFFF;
  const row = py >> 8;
  if (row >= 0x20) {
    return { value: 0, col: 0, row, subX: 0 };
  }

  // $20D3-$20E7: probe X, then read the cell's collision byte.
  const px = (p.x + dxSub) & 0xFFFF;
  const col = px >> 8;

  return {
    value: mapCollision(state, col, row),
    col,
    row,
    subX: (px >> 4) & 0x0F,   // pixel within the metatile, feeds slope tables
  };
}

/**
 * Floor probe.  ROM: sub_00_1DB9.
 *
 * Probes one hitbox-height below the player and dispatches on the collision
 * byte.  On a landable surface the original snaps the player's Y LOW byte to
 * zero (aligning the feet to the metatile row boundary) and zeroes VelY.
 *
 * @returns {{landed:boolean, value:number, col:number, row:number}}
 */
export function probeFloor(state) {
  const p = state.player;
  const hit = probe(state, 0, p.halfH << 4);
  let v = hit.value;

  // $20EA: an empty cell under the feet is not the end of it -- the floor
  // probe then looks sideways for a slope in the neighbouring column.
  if (v === COLL.AIR) {
    v = slopeProbe(state, hit.col, hit.row, hit.row);
  }

  const out = { landed: false, value: v, col: hit.col, row: hit.row };

  if (v === COLL.AIR) return out;

  // $1DDA: spikes hurt but do NOT stop the fall.
  if (v === COLL.SPIKE) return out;

  // $1DE1: an actor-owned destructible cell ($1F in the low 5 bits) is solid.
  if ((v & 0x1F) === COLL.DOOR) {
    land(state);
    out.landed = true;
    return out;
  }

  // $1DE7: >= $20 routes to the pickup handler in bank 1 ($4D4E).
  if (v >= COLL.PICKUP_ENERGY && v !== COLL.SPIKE && v !== COLL.SOLID_RUNTIME) {
    takePickup(state, hit);
    return out;
  }

  // $1DF9: an exit cell hands control to the scripted walk-through.
  if (v === COLL.EXIT) {
    out.landed = armScriptedMove(state) !== 0;
    return out;
  }

  if (LANDABLE.has(v)) {
    land(state);
    out.landed = true;
    return out;
  }

  // $1E3D / $1E51: conveyors land you and queue a carry displacement.
  if (v === COLL.CONVEYOR_R || v === COLL.CONVEYOR_L) {
    land(state);
    if (p.action !== 2) {                       // not mid rope-flight
      state.carry.x = v === COLL.CONVEYOR_R ? 4 : -4;
    }
    out.landed = true;
    return out;
  }

  // $1E65: breakable.
  if (v === COLL.BREAKABLE) {
    breakCell(state, hit.col, hit.row);
    land(state);
    out.landed = true;
    return out;
  }

  // $1EA0: water is passable and only sets the behind-BG attribute.
  if (v === COLL.WATER) {
    p.attrMask = 0x80;
    return out;
  }

  // $1E3A: step-solid.
  if (v === COLL.SOLID_STEP) {
    out.landed = true;
    return out;
  }

  return out;
}

// ---------------------------------------------------------------------------
// Slopes.  ROM: sub_00_20BA -> $210C (neighbour select) -> $21A6/$216A
//          (graphic id -> table) -> loc_00_21FD (apply).
//
// Six 16-byte height tables live contiguously at 0:$221C-$227B. Each is read
// FORWARDS when the slope tile is the right-hand neighbour and BACKWARDS when
// it is the left-hand one, so a single table serves both mirror directions --
// which is why the "left" base addresses are all table-start + 15.
//
// Slopes exist only on levels 1-2 and 12-14; levels 3-11 bail out early.
// ---------------------------------------------------------------------------

const SLOPE_T = { T0: 0, T1: 16, T2: 32, T3: 48, T4: 64, T5: 80 };

// X-snap tables, 0:$23B8-$2417 -- six 16-byte tables, same six slope shapes as
// the Y tables but indexed FORWARDS in both directions (unlike the Y tables,
// whose left variants read backwards from table-end).
// ROM: loc_00_2348 selects for rightward travel, loc_00_22F5 for leftward.
const SNAP_RIGHT = { 0x34: 0, 0x32: 16, 0x2C: 32, 0x29: 48 };
const SNAP_LEFT = { 0x36: 0, 0x31: 16, 0x2E: 32, 0x29: 48 };
const SNAP_LATE = { 0x3E: 64, 0x3F: 80 };

function snapBase(state, graphicId, right) {
  const lvl = state.level.number;
  if (lvl < 0x03) return (right ? SNAP_RIGHT : SNAP_LEFT)[graphicId];
  if (lvl < 0x0C) return undefined;
  return SNAP_LATE[graphicId];
}

/**
 * ROM: loc_00_2391 (rightward) / loc_00_231A (leftward).
 *
 * Walking into the foot of a slope does not stop you -- it REPOSITIONS you.
 * The table gives an X within the probed metatile; the player is rewritten to
 * one column back plus that offset, and the probe then reports "no wall".
 * Passing through without the rewrite leaves the player ~7 px off, which is
 * enough to change where they land.
 *
 * @returns always 0 (no wall); may rewrite the player's X as a side effect.
 */
function applySlopeSnap(state, base, offset, probeXhi, right) {
  const p = state.player;
  const t = state.tables.slopeX[base + offset];
  if (t === undefined) return 0;

  const a = u8(-(p.x & 0xF0));                     // $2398 / $2324: -(Xlo & $F0)

  if (right) {
    if (a - t < 0) return 0;                       // $239F: JR C -> no snap
    // $23A4: L = t + $80, then HL += $FF80.
    p.x = u16(((probeXhi << 8) | u8(t + 0x80)) + 0xFF80);
  } else {
    const b = u8(-t);                              // $2320: CPL / INC A
    if (a - b >= 0) return 0;                      // $232B: JP NC -> no snap
    // $2331: L = (-b) - $80, then HL += $0080.
    p.x = u16(((probeXhi << 8) | u8(u8(-b) - 0x80)) + 0x0080);
  }
  p.action = 0;                                    // $23B2 / $2341: cancel rope
  return 0;
}

/** graphic id -> base index, when the slope tile is the RIGHT neighbour. */
const SLOPE_RIGHT_EARLY = { 0x34: SLOPE_T.T0, 0x32: SLOPE_T.T1, 0x2C: SLOPE_T.T2, 0x29: SLOPE_T.T3 };
const SLOPE_RIGHT_LATE = { 0x3E: SLOPE_T.T4, 0x3F: SLOPE_T.T5 };
/** graphic id -> base index, when it is the LEFT neighbour (table end). */
const SLOPE_LEFT_EARLY = { 0x36: SLOPE_T.T0 + 15, 0x31: SLOPE_T.T1 + 15, 0x2E: SLOPE_T.T2 + 15, 0x29: SLOPE_T.T3 + 15 };
const SLOPE_LEFT_LATE = { 0x3E: SLOPE_T.T4 + 15, 0x3F: SLOPE_T.T5 + 15 };

function slopeBase(state, graphicId, fromRight) {
  const lvl = state.level.number;
  if (lvl < 0x03) {                                   // $21AB / $216F
    return (fromRight ? SLOPE_RIGHT_EARLY : SLOPE_LEFT_EARLY)[graphicId];
  }
  if (lvl < 0x0C) return undefined;                   // $21B1: levels 3-11 have none
  return (fromRight ? SLOPE_RIGHT_LATE : SLOPE_LEFT_LATE)[graphicId];
}

/**
 * ROM: loc_00_21FD. Snap the player onto a slope surface.
 * @returns COLL.SOLID_STEP if the player is standing on it, else 0.
 */
function applySlope(state, base, offset, probeRowHi) {
  const p = state.player;
  const table = state.tables.slopeY;
  const h = table[base + offset];
  if (h === undefined) return 0;

  // $2202: compare the player's own Y low byte against the surface height.
  if (((p.y & 0xF0) - h) < 0) return 0;               // $2207: JR C -> return 0

  // $2209: rebuild Y from the PROBE row and the surface height, one metatile up.
  p.y = (((probeRowHi << 8) | h) - 0x100) & 0xFFFF;
  return COLL.SOLID_STEP;                             // $2217: LD A,$09
}

/**
 * ROM: $210C. The floor cell was empty -- look at the neighbouring column for
 * a slope. Which neighbour depends on where the player sits inside the
 * metatile: near the left edge look left, near the right edge look right, and
 * in the middle band (pixelX 6-10) there is no slope at all.
 */
function slopeProbe(state, col, row, probeRowHi) {
  const p = state.player;
  const pixelX = (p.x & 0xF0) >> 4;                   // $210C

  // $2141: left neighbour. The index is negative, walking the table backwards.
  if (pixelX - 6 < 0) {
    const off = -(((pixelX - 6) & 0xFF) & 0x0F);      // AND $0F / CPL / INC A
    const nIdx = cellIndex(col - 1, row);
    const nv = mapCollisionByIndex(state, nIdx);
    if (nv !== 0) {                                   // $2150
      const gid = state.level.cells[nIdx * 2];        // $216C: DEC HL -> graphic id
      const base = slopeBase(state, gid, false);
      if (base !== undefined) return applySlope(state, base, off, probeRowHi);
      // $2175: not a slope (or a level with none) -> JP loc_00_2418, which
      // returns the NEIGHBOUR's collision. Standing near the edge of a
      // metatile, the diagonally adjacent cell holds the player up. Returning
      // "no floor" here drops him through every such ledge.
      return nv;
    }
    // $215E: nothing to the left -- fall through and try the right instead.
  }

  // $2116: right neighbour, forward index.
  if (pixelX + 5 >= 0x10) {
    const off = (pixelX + 5) & 0x0F;                  // $2125
    const nIdx = cellIndex(col + 1, row);
    const nv = mapCollisionByIndex(state, nIdx);
    if (nv === 0) return 0;                           // $2134
    const gid = state.level.cells[nIdx * 2];          // $21A8
    const base = slopeBase(state, gid, true);
    if (base !== undefined) return applySlope(state, base, off, probeRowHi);
    return nv;                                        // $21B3 -> loc_00_2418
  }
  return 0;                                           // $2122
}

/**
 * Wall-jump X velocity by facing. ROM: table 0:$27A6 = $14, $EC.
 * Derived from the tunable so the mod system actually owns it.
 */
const wallJumpVx = (state, facing) =>
  facing === 0 ? state.tunables.wallJumpVelocityX : -state.tunables.wallJumpVelocityX;

/**
 * Wall cling.  ROM: loc_00_1F33 (right wall) / loc_00_1FE9 (left wall).
 *
 * There is no "hang on the wall" state to hold and then release: the cling
 * IMMEDIATELY performs the jump (sub_00_1DA0) and sets a 16-frame lock. During
 * that lock the player is frozen outright -- position, velocity and gravity
 * all suspended -- and only then does the stored velocity take effect.
 *
 * The facing flips BEFORE the X velocity is looked up, so bouncing off a
 * right-hand wall launches you left and vice versa.
 *
 * @returns true if the cling took (in which case the probe reports "clear")
 */
function tryWallCling(state, right) {
  const p = state.player;

  p.action = 0;                              // $1F34 / $1FEA: cancel bat-rope

  if (p.dead) return false;                  // $1F37: $C715
  if (right ? p.facing !== 0 : p.facing === 0) return false;  // $1F3D / $1FF3
  if (p.jumpReleased === 0) return false;    // $1F42: needs A released first
  if ((state.input.held & 0x01) === 0) return false;          // $1F47: A held
  if (p.air === 0) return false;             // $1F4D: must be airborne

  p.facing = right ? 1 : 0;                  // $1F52 / $200D
  p.clingLock = right ? 0x50 : 0x30;         // $1F56 / $200F

  // sub_00_1DA0
  p.air = 1;                                 // rising
  p.airThrottle = 1;
  p.vy = state.tunables.wallJumpVelocityY;   // $22
  p.vx = wallJumpVx(state, p.facing);        // indexed by the NEW facing

  p.jumpReleased = 0;                        // $1F5D / $2016
  return true;
}

/** Restore delay by difficulty. ROM: $1E86 / $1E8A / $1E82. */
const BREAK_TIMER = [0x40, 0x0C, 0x04];
export const BREAK_SLOTS = 8;               // $C67B, 8 x 3 B {timer, col, row}

/**
 * ROM: loc_00_1E65. Stepping on a breakable turns it SOLID immediately and
 * queues a restore timer; it does not vanish. If all 8 timer slots are busy
 * the cell simply stays solid forever ($1E9D still returns "landed").
 */
export function breakCell(state, col, row) {
  setMapCollision(state, col, row, COLL.SOLID);          // $1E65: (HL) = $01

  const slots = state.breakables;
  for (let i = 0; i < BREAK_SLOTS; i++) {                // $1E99: CP $08
    if (slots[i].timer !== 0) continue;                  // $1E76
    slots[i].timer = BREAK_TIMER[state.flow.difficulty] ?? BREAK_TIMER[2];
    slots[i].col = col;                                  // $1E8D: $FFC0
    slots[i].row = row;                                  // $1E90: $FFC1
    return;
  }
}

/**
 * ROM: the delayed tile-restore pass inside sub_00_1336 ($1349).
 * Ticks every queued timer and puts the cell back to $06 when it expires.
 */
export function updateBreakables(state) {
  for (const s of state.breakables) {
    if (s.timer === 0) continue;
    if (--s.timer === 0) setMapCollision(state, s.col, s.row, COLL.BREAKABLE);
  }
}

/** ROM: loc_00_1E35 - snap to the row boundary and kill vertical speed. */
function land(state) {
  const p = state.player;
  p.y = p.y & 0xFF00;   // $FF84 = 0
  p.vy = 0;             // $FF87 = 0
}

/** X offsets the original probes with. ROM: $1EFE (right), $1FB4 (left). */
export const PROBE_DX_RIGHT = 0x0080;    // +8 px
export const PROBE_DX_LEFT = -0x0090;    // -9 px

/**
 * The collision value a horizontal probe resolves to.
 * ROM: sub_00_20BA -> loc_00_227C when the sampled cell is empty.
 *
 * The probe samples ONE cell at the player's own row. If that cell is empty
 * the game does not stop there: loc_00_227C then checks the cell ABOVE (when
 * the hitbox extends past the top of the metatile) and the cell BELOW (when it
 * extends past the bottom). So it is a three-cell sweep expressed as an
 * empty-cell fallback.
 *
 * Quirk reproduced verbatim: the UP test uses the half-WIDTH ($FF8C) while the
 * DOWN test uses the half-HEIGHT ($FF8D). That asymmetry looks like an
 * original oversight, but it is load-bearing -- it is exactly what makes
 * Batman scrape along an overhang for three frames while falling past it.
 */
export function horizontalCell(state, dxSub, right = dxSub > 0) {
  const p = state.player;
  const py = p.y & 0xFFFF;
  const row = py >> 8;
  if (row >= 0x20) return 0;                          // $20CB: below the world

  const col = ((p.x + dxSub) & 0xFFFF) >> 8;
  const idx = cellIndex(col, row);

  const own = mapCollisionByIndex(state, idx);
  if (own !== 0) return own;                          // $20E9 / $20FD

  // $2281: pixel row within the metatile, 0-15.
  const pixelY = (py & 0xF0) >> 4;

  // $2287: SUB (halfW - 3); a borrow means the hitbox pokes above this cell.
  if (pixelY - (p.halfW - 3) < 0) {
    const above = mapCollisionByIndex(state, idx - 1);
    if (above !== 0) return above;                    // $22A6: RET NZ
  }

  // $228A: ADD (halfH - 3); >= 16 means it pokes below.
  if (pixelY + (p.halfH - 3) >= 0x10) {
    if (row + 1 >= 0x20) return 0;                    // $22B9
    const below = mapCollisionByIndex(state, idx + 1);   // $22C3
    if (below === 0) return 0;

    // $22C6 does NOT return here -- it falls through to $22C9, which
    // dispatches on the probe mode into loc_00_2348 (rightward) or
    // loc_00_22F5 (leftward) and tests the below cell's GRAPHIC id against a
    // per-direction slope list. A slope is walked THROUGH, not into: those
    // paths snap the player's X and end at loc_00_23B6 (XOR A / RET) = no
    // wall. Returning the raw collision byte pins the player at the foot of
    // every slope; passing through without the snap leaves them ~7 px off.
    const gid = state.level.cells[(idx + 1) * 2];
    const base = snapBase(state, gid, right);
    if (base !== undefined) {
      // $22B0: the table index ($FFBC) is derived from the VERTICAL position
      // within the metatile, not the horizontal one -- how far the hitbox
      // pokes below decides how far along the slope you are.
      const offset = (pixelY + p.halfH) & 0x0F;
      const probeXhi = ((p.x + dxSub) & 0xFFFF) >> 8;
      return applySlopeSnap(state, base, offset, probeXhi, right);
    }

    return below;
  }
  return 0;                                           // $229A -> $2423
}

/**
 * Horizontal probe + wall resolution.
 * ROM: sub_00_1EF9 (right, mode 1) -> loc_00_1F61
 *      sub_00_1FAF (left,  mode 2) -> loc_00_1F87
 *
 * Both take a SINGLE sample at the player's own row (BC = $0000) offset
 * horizontally -- not a sweep over the hitbox. Sampling the feet row instead
 * would read the floor the player is standing on and wedge him in place.
 *
 * On wall contact the handler PUSHES the player 1 px out of the wall and then
 * conditionally snaps the X low byte back to $80 (the metatile centre). The
 * snap only happens when the velocity is not already carrying the player away
 * from the wall, which is why standing next to a wall is stable but the first
 * frame of walking keeps a permanent 1 px offset.
 *
 * @param side 'right' | 'left'
 * @returns 1 if movement is blocked, 0 otherwise
 */
export function resolveWall(state, side) {
  const p = state.player;
  const right = side === 'right';
  const v = horizontalCell(state, right ? PROBE_DX_RIGHT : PROBE_DX_LEFT, right);

  if (v === COLL.AIR) return 0;                       // $1F08 / $1FBE: RET Z

  // $1F14: an actor-owned destructible tests its LOW 5 BITS -- the top 3 hold
  // the owning $C1E8 slot, so e.g. $3F is slot 1's door and must still be
  // solid. This check comes BEFORE the pickup range or a door with any slot
  // bits set falls into it and reads as walkable.
  const isDoor = (v & 0x1F) === COLL.DOOR;

  // Arms that divert to their own handler and do not stop movement:
  // $1F20 exit trigger, $1F2E water, $1F1B pickups.
  if (!isDoor) {
    // $1F20: the horizontal probe's trigger cell arms the same script.
    if (v === COLL.TRIGGER) return armScriptedMove(state);
    // $1EA0 sets $FF96 (the behind-BG OAM attribute) and returns 0. It does NOT
  // set $FF95 -- slow/water movement mode is armed by the water-surface
  // subsystem, not by touching a water cell.
  if (v === COLL.WATER) { p.attrMask = 0x80; return 0; }
    if (v >= COLL.PICKUP_ENERGY && v < COLL.SPIKE) {
      takePickup(state, probe(state, right ? PROBE_DX_RIGHT : PROBE_DX_LEFT, 0));
      return 0;
    }
  }

  // $1F33 / $1FE9: before pushing, see whether this becomes a wall cling.
  if (tryWallCling(state, right)) return 0;   // $1F60 returns A = 0

  // $1F65 / $1F8B: these two are blocking but produce no push.
  if (v === COLL.SOLID_RUNTIME || v === COLL.SPIKE) return 1;

  // $1F6E / $1F94: push 1 px out of the wall.
  p.x = (p.x + (right ? -0x10 : 0x10)) & 0xFFFF;
  const xlo = p.x & 0xFF;

  if (right) {
    // $1F74: already past the centre, or moving left anyway -> leave it.
    if (xlo >= 0x80) return 1;
    if (p.vx < 0) return 1;
  } else {
    // $1F9A: mirror.
    if (xlo < 0x80) return 1;
    if (p.vx > 0) return 1;
  }
  p.x = (p.x & 0xFF00) | 0x80;                        // $1F80 / $1FA9
  return 1;
}

/** Ceiling probe. ROM: sub_00_1EA6. */
export function probeCeiling(state) {
  const p = state.player;
  const hit = probe(state, 0, -(p.halfH << 4));
  const v = hit.value;
  // $1EA6: same ordering as the horizontal probe -- the actor-owned door mask
  // is tested before the pickup range.
  if ((v & 0x1F) === COLL.DOOR && v !== 0) return v;
  if (v === COLL.AIR || v === COLL.WATER || v === COLL.SPIKE) return 0;
  if (v >= COLL.PICKUP_ENERGY && v !== COLL.SOLID_RUNTIME) return 0;
  return v;
}

/** ROM: loc_01_4D4E - consume a pickup cell and erase it. */
function takePickup(state, hit) {
  const t = state.tunables;
  const p = state.player;

  switch (hit.value) {
    case COLL.PICKUP_ENERGY:                       // $4DA6
      requestSound(state, 0x13);
      p.iframes = 0;                               // $4DAC: clears $C714
      p.hp = Math.min(p.hp + t.pickupEnergy, p.hpMax);
      break;
    case COLL.PICKUP_AMMO:                         // $4D96
      requestSound(state, 0x14);
      // $4D9F: ADD $0A with no cap at all -- ammo genuinely wraps past 255.
      state.flow.ammo = (state.flow.ammo + t.pickupBatarangs) & 0xFF;
      break;
    case COLL.PICKUP_MAXHP:                        // $4D5C
      requestSound(state, 0x15);
      p.iframes = 0;                               // $4D63
      p.hpMax = Math.min(p.hpMax + t.pickupMaxHP, t.maxHPCap);
      p.hp = p.hpMax;                              // $4D72: also fully heals
      break;
    default:
      return;
  }

  // $4DBD: the common tail zeroes BOTH bytes -- graphic as well as collision --
  // and queues a tilemap update. Clearing only the collision leaves the item
  // sitting there on screen, so it looks like nothing happened.
  setMapCell(state, hit.col, hit.row, 0, COLL.AIR);
}

/** ROM: sub_00_0AE1 mailbox. */
function requestSound(state, id, mask = 0x01) {
  if (state.sound && state.sound.queue.length < 4) {
    state.sound.queue.push({ id, mask });
  }
}
