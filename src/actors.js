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

/** Activation half-width by type. ROM: table 1:$4BA5. */
const ACTIVATION = [0, 0x0B, 0x0B, 0x0B, 0x0B, 0x0B, 0x0B, 0x0B, 0x0B, 0x0B, 0x0B, 0xFA];

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
    if (dist >= width) continue;                    // $4267: off-screen

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
 * Type 9 -- a retracting spike trap.  ROM: jt_01_464F.
 *
 * A wait timer at +$0C, then a counter at +$0B ticks up to $10 and latches at
 * $FF, at which point a 2x2 block of spike tiles is STAMPED INTO THE MAP:
 * graphics $2D/$2E/$2F/$30 with collision $FD across (col-1,row)..(col,row+1).
 * The trap is terrain, not a sprite -- which is why it is invisible to a
 * sprite-only model of the actor array.
 */
function actorType9(state, r) {
  if (r[0x0C] !== 0) { r[0x0C]--; return; }         // $4656: wait

  let a = r[0x0B];
  if (a !== 0xFF && a !== 0xFE) {                   // $4660/$4664
    a = u8(a + 1);                                  // $4668
    if (a < 0x10) { r[0x0B] = a; return; }          // $466B
    a = 0xFF;                                       // $4671
    r[0x0B] = a;
  }

  const col = r[1];                                 // $467B
  const row = r[3];                                 // $467E
  const clearing = a === 0xFE;                      // $4686

  // $468A / $469C: stamp or clear the 2x2 block. Column stride is 32 bytes
  // ($0020), i.e. one map column; row stride is 2.
  stamp(state, col - 1, row, clearing ? 0 : 0x2D, clearing ? 0 : 0xFD);
  stamp(state, col, row, clearing ? 0 : 0x2E, clearing ? 0 : 0xFD);
  stamp(state, col - 1, row + 1, clearing ? 0 : 0x2F, clearing ? 0 : 0xFD);
  stamp(state, col, row + 1, clearing ? 0 : 0x30, clearing ? 0 : 0xFD);
}

function stamp(state, col, row, graphic, collision) {
  const cells = state.level.cells;
  if (!cells || col < 0 || col >= state.level.width) return;
  const i = cellIndex(col, row) * 2;
  if (i + 1 >= cells.length) return;
  cells[i] = graphic;
  cells[i + 1] = collision;
}
