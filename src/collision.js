// Collision probing.  ROM: sub_00_20BA (core), $1DB9 floor, $1EA6 ceiling,
// $1EF9 horizontal, addressing sub_00_11B9.

import {
  mapCollision, setMapCollision, setMapCell, mapCollisionByIndex, cellIndex,
  u8, u16,
} from './state.js';
import { armScriptedMove } from './scriptedmove.js';
import { SLOTS, screenX, screenY } from './actors.js';
import { updateEffects } from './doors.js';

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
export function probe(state, dxSub, dySub, mode) {
  const p = state.player;

  // $20BA-$20C7: probe Y first; bail out if below the world.
  const py = (p.y + dySub) & 0xFFFF;
  const row = py >> 8;
  if (row >= 0x20) {
    return { value: 0, col: 0, row, subX: 0, px: 0, py };
  }

  // $20D3-$20E7: probe X, then read the cell's collision byte.
  const px = (p.x + dxSub) & 0xFFFF;
  const col = px >> 8;

  const cell = mapCollision(state, col, row);
  const subX = (px >> 4) & 0x0F;   // pixel within the metatile, feeds slope tables

  // $20EC: a non-empty cell settles it for every probe EXCEPT the floor, which
  // still runs the object scan so a platform can override solid ground.
  let value = cell;
  if (cell !== 0) {
    value = mode === MODE_FLOOR
      ? actorOverlap(state, mode, px, py, cell)      // $20F1 -> $2418
      : cell;                                        // $20FD
  }

  return { value, col, row, subX, px, py };
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
  const hit = probe(state, 0, p.halfH << 4, MODE_FLOOR);
  let v = hit.value;

  // $20EA: an empty cell under the feet is not the end of it -- the floor
  // probe then looks sideways for a slope in the neighbouring column, and
  // failing that at the map objects.
  if (v === COLL.AIR) {
    v = slopeProbe(state, hit.col, hit.row, hit.row, MODE_FLOOR, hit.px, hit.py);
  }

  const out = { landed: false, value: v, col: hit.col, row: hit.row };

  if (v === COLL.AIR) return out;

  // $1DDA: spikes hurt but do NOT stop the fall.
  if (v === COLL.SPIKE) return out;

  // $1DDE: `CP $FF / RET Z` -- an object floor returns immediately, BEFORE the
  // $1E35 arm that snaps the Y low byte to the metatile boundary. The scan has
  // already placed the player on the object's surface, and re-snapping would
  // drag him to whole-metatile alignment the cartridge never applies here.
  if (v === COLL.SOLID_RUNTIME) {
    out.landed = true;
    return out;
  }

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

  // $1E65: breakable. NOTE what this arm does NOT do -- unlike $1E35, $1E3D
  // and $1E51 it never writes $FF84 or $FF87, so landing on a breakable
  // leaves the Y low byte exactly where the fall put it. Only vy is zeroed,
  // and that is the CALLER's $1B44, not this routine.
  //
  // MEASURED on level 7 (warp 16,20, the col-16 floor is a $06 cell): the
  // cartridge lands at y = 6668 with ylo = $0C intact; a port that snapped
  // here landed at 6656 one frame early and shifted camY, which showed up as
  // "the map objects' cached screen Y is off by one" in the type-3/4
  // oscillator scenario -- the objects were exact, the player was not.
  if (v === COLL.BREAKABLE) {
    breakCell(state, hit.col, hit.row);
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
function slopeProbe(state, col, row, probeRowHi, mode, px, py) {
  const p = state.player;
  const pixelX = (p.x & 0xF0) >> 4;                   // $210C

  // $2141: left neighbour. The index is negative, walking the table backwards.
  if (pixelX - 6 < 0) {
    const off = -(((pixelX - 6) & 0xFF) & 0x0F);      // AND $0F / CPL / INC A
    const nIdx = cellIndex(col - 1, row);
    const nv = mapCollisionByIndex(state, nIdx);
    if (nv !== 0) {                                   // $2150
      // $2155: ONLY the floor probe goes on to the slope tables and the object
      // scan. Every other mode takes $215C -- `LD A,B / RET` -- and reports the
      // neighbour's collision as-is. Standing near the edge of a metatile, that
      // diagonally adjacent cell is what holds the player up.
      if (mode !== MODE_FLOOR) return nv;             // $215C
      const gid = state.level.cells[nIdx * 2];        // $216C: DEC HL -> graphic id
      const base = slopeBase(state, gid, false);
      // loc_00_21FD ends in a plain RET ($2217/$221A), so a slope short-circuits
      // the object scan entirely.
      if (base !== undefined) return applySlope(state, base, off, probeRowHi);
      // $2175: not a slope (or a level with none) -> JP loc_00_2418, which
      // carries the neighbour's collision into the object scan.
      return actorOverlap(state, mode, px, py, nv);
    }
    // $215E: nothing to the left -- fall through and try the right instead.
  }

  // $2116: right neighbour, forward index.
  if (pixelX + 5 >= 0x10) {
    const off = (pixelX + 5) & 0x0F;                  // $2125
    const nIdx = cellIndex(col + 1, row);
    const nv = mapCollisionByIndex(state, nIdx);
    if (nv === 0) {                                   // $2134 -> loc_00_2423
      return actorOverlap(state, mode, px, py, 0);
    }
    if (mode !== MODE_FLOOR) return nv;               // $213F, as $215C above
    const gid = state.level.cells[nIdx * 2];          // $21A8
    const base = slopeBase(state, gid, true);
    if (base !== undefined) return applySlope(state, base, off, probeRowHi);
    return actorOverlap(state, mode, px, py, nv);     // $21B3 -> loc_00_2418
  }
  // $2122: the middle band has no neighbour to consult -- straight to the
  // object scan with nothing from the map.
  return actorOverlap(state, mode, px, py, 0);        // -> loc_00_2423
}

// ---------------------------------------------------------------------------
// Map-object overlap.  ROM: loc_00_2426 - loc_00_2643.
//
// The last stage of every probe, and the one that makes map objects solid.
// Both loc_00_2418 and loc_00_2423 look like return sites -- they set $FFBA
// and stop -- but neither returns: both fall into loc_00_2426, which converts
// the probe point to SCREEN space and box-tests it against all 8 $C1E8 slots.
//
// It runs for the floor probe always (a live object with +6 bit 7 can override
// even a solid map cell), and for the other probes only once the map itself has
// come up empty.
//
// On a hit the routine REPOSITIONS the player -- Y onto the object's surface
// for the floor and ceiling probes, X out to its side for the horizontal ones
// -- and reports $FF, or $FD when the object is one of the two hurting types.
// ---------------------------------------------------------------------------

/** 8-bit |a - b|, the `SUB / JR NC / CPL / INC A` idiom at $24A1 and friends. */
const absDiff = (a, b) => (a >= b ? a - b : b - a);

/**
 * ROM: loc_00_2426. Returns the collision value the whole probe resolves to.
 *
 * @param mode       $C72B
 * @param probeX/Y   the probe point in world 12.4 ($FFB6/$FFB8 before $1172)
 * @param mapResult  what the map decided ($FFBA): 0, or the cell's own byte
 */
function actorOverlap(state, mode, probeX, probeY, mapResult) {
  const p = state.player;

  // $2643 is the punch probe's own scan over the ENEMY array -- ported as
  // meleeHitTest in enemies.js and dispatched by punchHitTest in player.js,
  // which owns the whole mode-5 flow. It never comes through here.
  // Unreachable as it stands: actorOverlap is only called from MODE_FLOOR and
  // the two horizontal paths, because the punch never routes through $2418 or
  // $2423 at all ($20EC/$2104 send mode 5 straight to $2643, the enemy scan).
  // Kept as the ROM's own answer for the mode, not as live code.
  if (mode === MODE_PUNCH) return mapResult;

  const probeSX = screenX(state, probeX);            // $2430 -> $FFB6
  const probeSY = screenY(state, probeY);            // $2430 -> $FFB8

  for (let slot = 0; slot < SLOTS; slot++) {
    const r = state.actors[slot];

    if ((r[0] & 0x80) === 0) continue;               // $244D: not live
    const type = r[0] & 0x7F;
    if (type === 0x07 || type === 0x09) continue;    // $2454 / $2459

    // $2478: an object outside world rows $10-$20 is not testable at all.
    if (r[3] < 0x10 || r[3] >= 0x21) continue;

    const halfW = r[7];                              // $2465 -> $C75A
    const halfH = r[8];                              // $2469 -> $C72E
    const objX = (r[1] << 8) | r[2];                 // $246F
    const objY = (r[3] << 8) | r[4];                 // $2474
    const objSX = r[9];                              // $2485
    const objSY = r[10];                             // $2486

    // $248B: the riding flag is cleared unless $FFC6 is already set, so the
    // first slot to claim the player keeps the claim for the rest of the scan.
    if (state.standingOnActor === 0) r[13] = 0;      // $2490

    // --- X axis ($24A1) ------------------------------------------------
    // The floor and ceiling probes retest at the player's foot span, -7 then
    // +6 px; the horizontal probes get a single sample.
    if (absDiff(objSX, probeSX) >= halfW) {
      if (mode < MODE_CEILING) continue;             // $24AF
      let d = u8(probeSX + 0xF9);                    // $24B2: -7
      if (absDiff(objSX, d) >= halfW) {
        d = u8(d + 0x0D);                            // $24BF: +6 from the start
        if (absDiff(objSX, d) >= halfW) continue;    // $24CA
      }
    }

    // --- Y axis ($24CD) ------------------------------------------------
    // Mirror image: the horizontal probes sweep the hitbox height, the
    // vertical ones do not.
    if (absDiff(objSY, probeSY) >= halfH) {
      if (mode >= MODE_CEILING) continue;            // $24DB
      let e = u8(probeSY - u8(p.halfW - 2));         // $24DE
      if (absDiff(objSY, e) >= halfH) {
        e = u8(e + u8(p.halfW - 2) + u8(p.halfH - 2));  // $24EF
        if (absDiff(objSY, e) >= halfH) continue;    // $2502
      }
    }

    // --- hit ($2505) ---------------------------------------------------
    if (mode === MODE_HORIZONTAL || mode === 2) {    // $2563 / $25AA
      // $2566: only a clinging player is registered as riding a wall object.
      if (p.clingLock & 0x1F) {
        r[13] = 1;
        state.standingOnActor = 1;
      }
      if (type === 0x06 || type === 0x0A) return COLL.SPIKE;   // $257A / $25C1
      // Right-probe pushes out to the object's left face and vice versa; the
      // left face is one pixel tighter ($2587 DEC A).
      const off = mode === MODE_HORIZONTAL ? u8(halfW - 1 + 8) : u8(halfW + 8);
      p.x = mode === MODE_HORIZONTAL
        ? u16(objX - (off << 4))                     // $2584-$25A6
        : u16(objX + (off << 4));                    // $25C9-$25DF
      return COLL.SOLID_RUNTIME;                     // $2622
    }

    if (mode === MODE_CEILING) {                     // $25E3
      if (type === 0x06 || type === 0x0A) return COLL.SPIKE;   // $25EF / $25F3
      if (type === 0x0B) continue;                   // $25F7: skip, keep scanning
      const push = u8(u8(p.halfW + 2) + halfH);      // $25FB-$2604
      p.y = u16(objY + (push << 4));                 // $2605-$2615
      // $2617: a grounded player who bumps his head on one of these is hurt
      // by it; an airborne one is merely stopped.
      return p.air === 0 ? COLL.SPIKE : COLL.SOLID_RUNTIME;
    }

    // --- floor ($2516) -------------------------------------------------
    // $2520: a real map cell wins unless the object's +6 bit 7 says otherwise.
    if (mapResult !== 0 && (r[6] & 0x80) === 0) return mapResult;   // $2529

    r[13] = 1;                                       // $2534
    state.standingOnActor = 1;                       // $2537: $FFC6
    const drop = u8(u8(p.halfH + halfH) - 1);        // $253A-$2542
    p.y = u16(objY - (drop << 4));                   // $2543-$255E
    return COLL.SOLID_RUNTIME;                       // $2622
  }

  // $2631: the floor probe reports whatever the map had; everything else
  // reports "nothing", discarding it.
  return mode === MODE_FLOOR ? mapResult : 0;        // $263E / $2641
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
 * ROM: the delayed tile pass inside sub_00_1336 ($1349). Ticks every queued
 * timer and ERASES the cell when it expires -- see the note below; the routine
 * used to be called a "restore" and that was the bug.
 *
 * It also carries sub_00_1336's own first instruction, `XOR A / LDH [$FFC6],A`
 * at $1336-$1338, because this is the routine main.js calls at that entry
 * point. $FFC6 -- "some object has claimed the player this frame" -- is
 * CLEARED PER FRAME and rebuilt by the overlap scan; nothing else ever zeroes
 * it. Leaving it latched leaves every +$0D riding flag latched with it, which
 * MEASURED as a real divergence: level 3's type-5 platform outruns the falling
 * player at f82, the cartridge drops his ride flag on that frame, and a port
 * that keeps it goes on applying the platform's $30-per-frame carry -- 48
 * subpixels of extra fall per frame, and death by f97 in a run where the
 * cartridge's player is unharmed.
 */
export function updateBreakables(state, manifest) {
  state.standingOnActor = 0;                      // $1336: XOR A / LDH [$FFC6]

  // $1339-$1347: the queue only ticks on levels 5, 7 and $0C. Everywhere else
  // sub_00_1336 jumps straight to loc_00_1391 -- so a cell that has been
  // stepped on stays SOLID for the rest of the level (there is no restore at
  // all), but loc_00_1391 STILL RUNS. That label is not an exit, it is the
  // next third of the same routine, and skipping to a `return` here would have
  // frozen the effect pool on all eleven other levels.
  const lv = state.level.number;
  if (lv === 5 || lv === 7 || lv === 0x0C) restoreTimers(state);

  // $1391: the $C693 effect pool, ported in doors.js because the door
  // sequencer is currently its only wired spawner. It is called from here
  // rather than from main.js because it IS this routine -- sub_00_1336 runs
  // $1349 and $1391 back to back, ahead of the $1438 boss gate and the player
  // state machine, and an effect spawned by the punch at $2099 must therefore
  // NOT be ticked on the frame it is created. (MEASURED: the door's $97 effect
  // still reads $97 at the end of its own spawn frame and only starts counting
  // on the next one.)
  updateEffects(state, manifest);
}

function restoreTimers(state) {
  for (const s of state.breakables) {
    if (s.timer === 0) continue;
    // $1364: the expiring cell is ERASED -- graphic AND collision both zeroed
    // -- not put back to $06. It crumbles away and leaves a hole; the ROM also
    // spawns a puff through $C744-$C747 + sub_00_0CC2 ($97/$01), effect-pool
    // work the port does not model.
    //
    // MEASURED on level 7 (warp 16,20, difficulty 1 -> a $0C timer): the
    // player breaks the col-16 floor at f34 and falls through the hole at f46,
    // exactly 12 frames later. A port that restored $06 left him standing
    // there for the whole run.
    if (--s.timer === 0) setMapCell(state, s.col, s.row, 0, 0);
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

  const px = (p.x + dxSub) & 0xFFFF;
  const col = px >> 8;
  const idx = cellIndex(col, row);
  const mode = right ? MODE_HORIZONTAL : 2;

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
    if (below === 0) {                                // $22C6 -> loc_00_2423
      return actorOverlap(state, mode, px, py, 0);
    }

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
      return applySlopeSnap(state, base, offset, col, right);
    }

    return below;
  }
  // $229A: the hitbox pokes past neither edge, so the map has nothing more to
  // say -- hand the probe point to the object scan.
  return actorOverlap(state, mode, px, py, 0);        // -> loc_00_2423
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

/**
 * Ceiling probe. ROM: sub_00_1EA6.
 *
 * Quirks kept:
 * - The probe offset is -(half-WIDTH << 4) -- $1EAB reads $FF8C, not $FF8D.
 *   Same asymmetry as the horizontal sweep's up-test.
 * - Spikes overhead ($1ECE -> loc_00_1EE9): on LEVEL 5 ONLY, while airborne,
 *   they are a plain solid ceiling -- the descending trap pushes the player
 *   down a row instead of hurting him. Grounded (the trap reaching his head
 *   row), or on any other level, they deal spike damage and are NOT solid.
 * - Every other solid returns exactly 1 and cancels the bat-rope ($1EE2);
 *   only $FF keeps its value, which is what skips the row snap at $1AA5.
 * - The ceiling probe collects pickups ($1ED9 -> 1:$4D4E).
 */
export function probeCeiling(state) {
  const p = state.player;
  const hit = probe(state, 0, -(p.halfW << 4), MODE_CEILING);   // $1EAB: $FF8C
  let v = hit.value;
  // $20FF -> $210C: an empty cell falls into the SAME neighbour/slope lookup
  // as the floor probe -- mode 3 and mode 4 share it. Near a metatile edge
  // the diagonally adjacent cell is the ceiling; this is how the level-5
  // spike trap's column catches a player hugging its edge.
  if (v === COLL.AIR) {
    v = slopeProbe(state, hit.col, hit.row, hit.row, MODE_CEILING, hit.px, hit.py);
  }
  if (v === COLL.AIR) return 0;                      // $1EC9
  if (v === COLL.SOLID_RUNTIME) return 0xFF;         // $1ECB
  if (v === COLL.SPIKE) {                            // $1ECE -> loc_00_1EE9
    if (state.level.number === 5 && p.air !== 0) return 1;   // $1EF6
    spikeDamage(state);                              // loc_00_1E14
    return 0;
  }
  if ((v & 0x1F) === COLL.DOOR) { p.action = 0; return 1; }  // $1ED2 -> $1EE2
  if (v >= COLL.PICKUP_ENERGY) {                     // $1ED9 -> 1:$4D4E
    takePickup(state, hit);
    return 0;
  }
  if (v === COLL.WATER) { p.attrMask = 0x80; return 0; }     // $1EDE -> $1EA0
  p.action = 0;                                      // $1EE2
  return 1;
}

/** ROM: loc_00_1E14 - 4 damage, knockback away from the current facing. */
function spikeDamage(state) {
  const p = state.player;
  if (p.dead) return;                                // $1E14: $C715
  if (p.iframes !== 0) return;                       // $1E1A
  p.hp = Math.max(0, p.hp - state.tunables.spikeDamage);   // $1E20 -> sub_00_2777
  if (state.sound && state.sound.queue.length < 4) {
    state.sound.queue.push({ id: 0x12, mask: 0x01 });      // $277F
  }
  // $1E25: facing right stamps the knockback-left bit.
  p.iframes = p.facing === 0
    ? (state.tunables.invulnFrames | 0x80)
    : state.tunables.invulnFrames;
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
