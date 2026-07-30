// @ts-check
// The enemy's own collision probe.
//
// ROM range: sub_01_6666 (the one-cell sample with its five modes) and its
// wrappers -- sub_01_63B4 / sub_01_6499 (horizontal, via the shared tail at
// $63E8 / $64CF), sub_01_64FA (ceiling), sub_01_656A (floor), sub_01_6616
// (attack) -- plus loc_01_6748 (mode 5's player hit), loc_01_67CC (the $C1E8
// object-platform test), loc_01_6415 (the wall-ahead assist) and loc_01_65C0
// (the floor snap).
//
// $FFBE STAYS ON state, DELIBERATELY. state.enemyBesideIdx is a true HRAM
// global: it persists across probes, across slots AND across frames, and WHICH
// slot last wrote it depends on the driver's $FFA7 walk direction. A
// module-local here would still pass tests/enemies.test.js:132 -- that test
// covers same-slot staleness only -- while silently deleting the cross-slot
// behaviour wallResolve depends on. Do not hoist it.

import { u8, i8, u16, mapCollisionByIndex } from '../state.js';
import {
  addX, absDiff8, neg16q, playerScreenX, playerScreenY, requestSound,
} from './util.js';

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
export function probeCore(state, r, dx, dy, mode) {
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
export function probeRight(state, r) {
  return wallResolve(state, r, probeCore(state, r, r[0x0A] << 4, 0, 1), 1);
}

export function probeLeft(state, r) {
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
export function wallAhead(state, r, mode) {
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
export function probeUp(state, r) {
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
export function probeDown(state, r) {
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
export function attackProbe(state, r) {
  let dx = (r[0x1E] << 4) & 0xFFFF;
  if (r[5] & 0x01) dx = neg16q(dx);                 // $6639
  const dy = u16(i8(r[0x1F]) << 4);                 // $6648
  return probeCore(state, r, dx, dy, 5);
}
