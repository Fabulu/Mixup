// Map objects -- the $C1E8 array.  ROM: driver sub_01_4230, dispatch 1:$427B.
//
// 8 slots x 16 bytes, preloaded whole at level init from a bank-5 blob that is
// a byte-identical image of the RAM records (no streaming spawner). These are
// the platforms, conveyors, doors, spike traps and bat-rope anchors.
//
// Record layout (master reference §5.1, refined against the handlers):
//   +0     type 1-11, bit 7 = currently on-screen
//   +1/+2  X world 12.4 (hi, lo)
//   +3/+4  Y world 12.4 (hi, lo)
//   +5     X velocity
//   +6     Y velocity; bit 7 also lets the object override a solid map cell
//          in the collision scan ($2525)
//   +7     collision half-WIDTH, in screen pixels  ($2465 -> $C75A)
//   +8     collision half-HEIGHT, in screen pixels ($2469 -> $C72E)
//   +9/+$0A  cached SCREEN x, y -- recomputed each update from the world
//          position and the camera (1:$4852), and the only coordinates the
//          overlap scan ever compares against
//   +$0B   state counter
//   +$0C   wait timer
//   +$0D   player-riding flag
//   +$0F   travel limit

import { u8, cellIndex } from './state.js';

export const SLOTS = 8;
export const RECORD = 16;

/**
 * Activation half-width by type. ROM: table 1:$4BA5, indexed by the RAW type.
 * Types 9 and 10 use narrower windows ($08/$09); type 11 reads one byte past
 * the table's end -- $FA, the first opcode of sub_01_4BB0 -- so it is always
 * active.
 */
const ACTIVATION = [0, 0x0B, 0x0B, 0x0B, 0x0B, 0x0B, 0x0B, 0x0B, 0x0B, 0x08, 0x09, 0xFA];

/**
 * Types whose handler is not ported yet. Listing them explicitly (rather than
 * silently doing nothing) keeps the gap honest and greppable.
 *   1 $488D  2 $48E4*  3 $499B  4 $4940  5 $4291  6 $42E3
 *   7 $4447  8 $4525   9 $464F 10 $4765* 11 $483C      (* never placed)
 */
export const UNIMPLEMENTED_TYPES = new Set([1, 2, 4, 5, 6, 8, 10, 11]);

export function createActors() {
  return Array.from({ length: SLOTS }, () => new Uint8Array(RECORD));
}

/** Load the level's object blob. ROM: sub_00_2889 block-copies it verbatim. */
export function loadActors(state, records, count) {
  for (let i = 0; i < SLOTS; i++) {
    state.actors[i].fill(0);
    if (i < count) state.actors[i].set(records.subarray(i * RECORD, (i + 1) * RECORD));
  }
}

/** ROM: sub_01_4230 */
export function updateActors(state) {
  for (let slot = 0; slot < SLOTS; slot++) {
    const r = state.actors[slot];
    if (r[0] === 0) continue;                       // $4240: empty

    state.currentActorSlot = slot;                  // $4234: $C75A
    if (state.flow.paused) continue;                // $4246: $C716
    if (state.lagFrame) continue;                   // $424D: $C757

    // $4257: activation is a pure camera-distance test on the HIGH bytes.
    const type = r[0] & 0x7F;
    const width = ACTIVATION[type] ?? 0x0B;
    const camCol = u8((state.camera.x >> 8) + 5);   // $425D
    const dist = Math.abs(camCol - r[1]);           // $4261
    if (dist >= width) {                            // $4267 -> loc_01_4A51
      r[0] &= 0x7F;                                 // drifting out clears bit 7
      continue;
    }

    r[0] |= 0x80;                                   // $426B: SET 7
    dispatch(state, r, type);
    cacheScreenPos(state, r);
  }
}

/**
 * ROM: 1:$4849-$485D, and the same six instructions in every other handler.
 *
 * Each type handler converts its own world position to screen pixels through
 * sub_00_1172 and parks the result at +9/+$0A. The collision scan at
 * loc_00_2426 compares ONLY against those cached bytes -- it never re-derives
 * them -- so an object that fails to write them is invisible to collision even
 * while it draws correctly.
 *
 * Doing it here rather than inside each handler is equivalent as long as the
 * camera is fixed for the frame, which it is: the camera routine runs once,
 * ahead of the actor driver.
 */
function cacheScreenPos(state, r) {
  const wx = (r[1] << 8) | r[2];
  const wy = (r[3] << 8) | r[4];
  r[9] = screenX(state, wx);
  r[10] = screenY(state, wy);
}

// sub_00_1172. The four SLA/RLA pairs are a 16-bit `<< 4` whose top nibble
// falls off the end, which is just `>> 4` of the difference; the $08/$10
// addends are the OAM origin offsets.
export const screenX = (state, worldX) =>
  u8((((worldX - state.camera.x) & 0xFFFF) >> 4) + 0x08);
export const screenY = (state, worldY) =>
  u8((((worldY - state.camera.y) & 0xFFFF) >> 4) + 0x10);

// NOTE: an earlier version ran a "$15BA contact" test here that removed the
// object and dealt 2 damage on overlap. That routine (loc_00_1444..$1626)
// walks the $C6CF PICKUP-DROP array, not $C1E8 -- the oracle caught it
// deleting the level-5 spike trap the moment the player walked under it. Map
// objects have no generic player contact; anything that hurts does so through
// its own handler or the cells it stamps. The $C6CF drops are not ported yet.

/** ROM: sub_00_0AE1 mailbox. */
function requestSound(state, id, mask = 0x01) {
  if (state.sound && state.sound.queue.length < 4) {
    state.sound.queue.push({ id, mask });
  }
}

function dispatch(state, r, type) {
  switch (type) {
    case 3: actorType3(state, r); break;
    case 7: actorType7(state, r); break;
    case 9: actorType9(state, r); break;
    default: break;                                 // see UNIMPLEMENTED_TYPES
  }
}

/**
 * Type 7 -- a pulsing water spout.  ROM: jt_01_4447.
 *
 * Level 1's only object, four of them strung across the pit at columns 99-112.
 * Like the type-9 spike trap it is TERRAIN, not a sprite: it stamps graphic
 * $47 / collision $FD one cell at a time straight down its own column from row
 * $13, then erases the same column on the way back up, waits, and repeats. So
 * the falling water is drawn by the tilemap and hurts on contact like spikes.
 *
 * It stays dormant until the player is within 5 metatiles horizontally, and
 * both the step rate and the pause between pulses scale with difficulty -- on
 * hard the streams come roughly five times as often.
 *
 * Note the rope deliberately passes THROUGH $FD on level 1 ($3DF1): these
 * cells are exactly why that special case exists, so the grapple cannot catch
 * on a column of water.
 */
function actorType7(state, r) {
  const hard = state.flow.difficulty !== 0;

  if (r[0x0C] !== 0) {                              // $444E: pulse gate
    if (--r[0x0C] !== 0) return;                    // $4453
    // $4457: the pause between pulses ended -- announce the next one. Only
    // when idle; the timer also gates each row step mid-pulse.
    if (r[0x0B] === 0) requestSound(state, 0x20);   // $445D
    return;
  }

  let phase = r[0x0B];

  if (phase === 0) {                                // $4466: dormant
    // $4470: a plain distance test on the HIGH bytes, tighter than the
    // activation window the driver already applied.
    const dist = Math.abs((state.player.x >> 8) - r[1]);
    if (dist >= 5) return;                          // $4477
    r[0x0B] = 1;                                    // $4480
    return;
  }

  if (phase !== 0xFF && phase !== 0xFE) {           // $4486: arming, 1 -> 2 -> $FF
    const a = u8(phase + 1);
    if (a < 3) { r[0x0B] = a; return; }             // $448F
    phase = 0xFF;                                   // $4497
    r[0x0B] = 0xFF;
  }

  // $449A: one cell per step -- draw on the way down, erase on the way back.
  const col = r[1];
  const row = r[3];
  if (phase !== 0xFE) stamp(state, col, row, 0x47, 0xFD);   // $44B0
  else stamp(state, col, row, 0, 0);                        // $44B8

  r[0x0C] = hard ? 1 : 2;                           // $44D6: step rate

  const next = u8(row + 1);                         // $44E7
  if (next < 0x20) { r[3] = next; return; }         // $44E9

  // $44ED: the column reached the floor. Extending flips to erasing; erasing
  // goes fully idle and waits out the gap before the next pulse.
  if (phase !== 0xFE) {
    r[0x0B] = 0xFE;                                 // $44F8
  } else {
    r[0x0B] = 0;                                    // $44FE
    r[0x0C] = state.flow.difficulty === 0 ? 0x50    // $4511
      : state.flow.difficulty === 1 ? 0x28          // $450D
      : 0x10;                                       // $4509
  }
  r[3] = r[0x0F];                                   // $4518: back to the top
}

/**
 * Type 3 -- a vertically oscillating object.  ROM: jt_01_499B.
 *
 * +6 is a signed Y velocity: positive values are bled off 2 per frame, and
 * once it reaches zero (or is already negative) it accelerates downward by 1
 * per frame, clamped at $F0 (-16).
 */
function actorType3(state, r) {
  const v = r[6];

  if (v !== 0 && (v & 0x80) === 0) {                // $49A2/$49A6
    const next = v - 2;                             // $49AA
    r[6] = next < 0 ? 0 : next;                     // $49AE / $49B2
    if (next >= 0) moveActorY(r, next);             // $49B7 -> $4943
    return;
  }

  // $49BA: accelerate downward, clamped.
  let a = u8(v - 1);
  if (a < 0xF0) a = 0xF0;                           // $49BE: unsigned CP $F0
  r[6] = a;
  moveActorY(r, (a << 24) >> 24);                   // $49C8 -> sub_01_4A79
}

/** 16-bit Y add on the record. ROM: sub_01_4A79 / loc_01_4943. */
function moveActorY(r, delta) {
  const y = (((r[3] << 8) | r[4]) + delta) & 0xFFFF;
  r[3] = (y >> 8) & 0xFF;
  r[4] = y & 0xFF;
}

/**
 * Type 9 -- a descending spike trap.  ROM: jt_01_464F.
 *
 * A wait timer at +$0C, then a counter at +$0B ticks up to $10 and latches at
 * $FF. From then on the trap is a two-column spike STAMPED INTO THE MAP, two
 * cells per step: +$0B holds the phase ($FF extending, $FE retracting) and +3
 * the current row. Extending writes shaft tiles $2D/$2E at the row and tip
 * tiles $2F/$30 one row below, every 2 frames, until the row reaches $1D --
 * then it waits $10 frames and retracts (clear the row, move the tips up)
 * every $0C frames back to row $17, waits ($20 frames, or 8 above difficulty
 * 0) and repeats. The trap is terrain, not a sprite -- which is why it is
 * invisible to a sprite-only model of the actor array, and why the player's
 * CEILING probe is what it fights (see probeCeiling's level-5 spike rule).
 */
function actorType9(state, r) {
  if (r[0x0C] !== 0) { r[0x0C]--; return; }         // $4656: wait
  let phase = r[0x0B];
  if (phase !== 0xFF && phase !== 0xFE) {           // $4660/$4664: arming
    const a = u8(phase + 1);                        // $4668
    if (a < 0x10) { r[0x0B] = a; return; }          // $4669
    phase = 0xFF;                                   // $4671
    r[0x0B] = 0xFF;
  }

  const col = r[1];                                 // $467B: X hi
  const row = r[3];                                 // $467E: current Y hi
  if (phase !== 0xFE) {                             // $468A: extend downward
    stamp(state, col, row, 0x2E, 0xFD);
    stamp(state, col - 1, row, 0x2D, 0xFD);
    stamp(state, col - 1, row + 1, 0x2F, 0xFD);     // $46A7: the tips
    stamp(state, col, row + 1, 0x30, 0xFD);
  } else {                                          // $469C: retract upward
    stamp(state, col, row, 0, 0);
    stamp(state, col - 1, row, 0, 0);
    stamp(state, col - 1, row - 1, 0x2F, 0xFD);
    stamp(state, col, row - 1, 0x30, 0xFD);
  }
  r[0x0C] = phase !== 0xFE ? 2 : 0x0C;              // $4711 / $4715

  if (phase !== 0xFE) {                             // $4723
    const next = u8(row + 1);
    if (next < 0x1D) { r[3] = next; return; }       // $4725
    r[0x0B] = 0xFE;                                 // $472D: full length
    r[0x0C] = 0x10;
    requestSound(state, 0x24);                      // $4733
    r[3] = 0x1D;                                    // $473D
    return;
  }
  const next = u8(row - 1);                         // $4743
  if (next >= 0x18) { r[3] = next; return; }        // $4745
  r[0x0B] = 0xFF;                                   // $474D: rearm
  r[0x0C] = state.flow.difficulty !== 0 ? 8 : 0x20; // $4750
  r[3] = 0x17;                                      // $4761
}

function stamp(state, col, row, graphic, collision) {
  const cells = state.level.cells;
  if (!cells || col < 0 || col >= state.level.width) return;
  const i = cellIndex(col, row) * 2;
  if (i + 1 >= cells.length) return;
  cells[i] = graphic;
  cells[i + 1] = collision;
}
