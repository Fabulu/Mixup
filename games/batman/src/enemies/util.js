// @ts-check
// Enemy record arithmetic and the two screen-space conversions.
//
// ROM range: sub_01_63AD (the 16-bit big-endian adds on the record), the
// CPL/CPL/INC negate idiom used at 1:$6639, 1:$6C68 and 1:$5B30, the
// SUB / JR NC / CPL / INC absolute-difference idiom, $1B4A -> sub_00_1172
// (the player's cached screen bytes $FF93/$FF94) and the sub_00_0AE1 sound
// mailbox.
//
// These are leaves. Nothing here reads or writes any driver ordering state,
// which is why this block came out of src/enemies.js first.

import { u8, u16 } from '../state.js';

/** ROM: sub_01_63AD - 16-bit big-endian add on the record. */
export function addX(r, d) {
  const v = u16(((r[0x0E] << 8) | r[0x0F]) + d);
  r[0x0E] = v >> 8;
  r[0x0F] = v & 0xFF;
}

export function addY(r, d) {
  const v = u16(((r[0x10] << 8) | r[0x11]) + d);
  r[0x10] = v >> 8;
  r[0x11] = v & 0xFF;
}

/**
 * The ROM's 16-bit negate idiom (CPL both bytes, +1 unless the complemented
 * low byte is already zero). For lo = $FF the +1 is skipped and the result is
 * short by $100 -- kept faithful; see $6639, $6C68, $5B30.
 */
export function neg16q(v) {
  const lo = u8(~v), hi = u8(~(v >> 8));
  return lo === 0 ? hi << 8 : u16((hi << 8) + lo + 1);
}

/** 8-bit absolute difference, as the SUB / JR NC / CPL / INC idiom computes. */
export function absDiff8(a, b) {
  return (a & 0xFF) >= (b & 0xFF) ? u8(a - b) : u8(b - a);
}

/** ROM: $1B4A -> sub_00_1172. $FF93/$FF94 recomputed from live state; the
 *  original stores them each frame before the enemy driver runs. */
export function playerScreenX(state) {
  return u8((u16(state.player.x - state.camera.x) >> 4) + 8);
}

export function playerScreenY(state) {
  return u8((u16((state.player.y & 0x0FFF) - state.camera.y) >> 4) + 0x10);
}

/** ROM: sub_00_0AE1 mailbox. */
export function requestSound(state, id, mask = 0x01) {
  if (state.sound && state.sound.queue.length < 4) {
    state.sound.queue.push({ id, mask });
  }
}
