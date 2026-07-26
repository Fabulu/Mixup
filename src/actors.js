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
//   +6     Y velocity
//   +7     flags; bit 0 = hurts the player
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
export const UNIMPLEMENTED_TYPES = new Set([1, 2, 4, 5, 6, 7, 8, 10, 11]);

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
    contactPlayer(state, r);
  }
}

/**
 * Player contact.  ROM: the $15BA overlap test -> loc_00_15D5.
 *
 * Box is $0C14 = 12 x 20 around the player's screen position. On a hit the
 * object is REMOVED (its type byte is zeroed) and, if +7 bit 0 is set, it
 * deals 2 damage and stamps the invulnerability timer with the knockback
 * direction encoded in bit 7 -- $DA when facing right, $5A when facing left,
 * i.e. you are always thrown away from the way you were looking.
 */
function contactPlayer(state, r) {
  const p = state.player;
  const t = state.tunables;

  const px = p.x >> 4, py = p.y >> 4;
  const ax = (((r[1] << 8) | r[2]) & 0xFFFF) >> 4;
  const ay = (((r[3] << 8) | r[4]) & 0xFFFF) >> 4;
  if (Math.abs(ax - px) > 0x0C || Math.abs(ay - py) > 0x14) return;   // $15C4

  r[0] = 0;                                        // $15CF: the object is gone
  if ((r[7] & 0x01) === 0) return;                 // $15D5: harmless

  if (p.dead) return;                              // $15D9
  if (p.iframes !== 0) return;                     // $15DF

  p.hp = Math.max(0, p.hp - t.objectContactDamage);   // $15E5 -> sub_00_2777
  requestSound(state, 0x12);                          // $277F
  // $15EA: facing right stamps the knockback-left bit.
  p.iframes = p.facing === 0 ? (t.invulnFrames | 0x80) : t.invulnFrames;
}

/** ROM: sub_00_0AE1 mailbox. */
function requestSound(state, id, mask = 0x01) {
  if (state.sound && state.sound.queue.length < 4) {
    state.sound.queue.push({ id, mask });
  }
}

function dispatch(state, r, type) {
  switch (type) {
    case 3: actorType3(state, r); break;
    case 9: actorType9(state, r); break;
    default: break;                                 // see UNIMPLEMENTED_TYPES
  }
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
