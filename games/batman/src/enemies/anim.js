// Enemy animation state machine, the walk cycle, the draw queue and its flush.
//
// ROM range: $5DFF-$6063 (the animation machine and metasprite selection),
// loc_01_5FE6 (the walk cycle), 1:$6063-$6071 with sub_00_0BC6 (the OAM push
// and the grounded-only Y bob), sub_00_0BAF (the alternate metasprite table)
// and the pose-pointer tables at 1:$6891-$6BC0.
//
// ORDER LIVES IN THIS FILE. queueDraw appends; drawEnemies flushes in
// insertion order and clears. That order IS the ROM's OAM push order --
// parity-alternating slot order included -- which on the DMG is sprite
// priority and the ten-sprites-per-line cut. It is pinned by
// games/batman/tests/frameorder.test.js (the full ordered sprite queue at both
// $FFA7 parities) and by the insertion-order test in
// games/batman/tests/enemy-order.test.js. Do not reorder, sort or reverse the
// queue.

import { u8 } from '../state.js';
import {
  E_FLAGS, E_STATE, E_ANIM_TIMER, E_ANIM_FRAME, E_FACING, E_SCREEN_X,
  E_SCREEN_Y, E_JUMP_VEL,
} from './record.js';
import { drawMetasprite, drawYBob } from '../render/metasprite.js';

/** @typedef {import('../gametypes.js').GameState} GameState */

/**
 * ROM: $5DFF-$6063 - the animation state machine and metasprite selection.
 * The pose tables live in the ANIM_ROM blob (1:$6891-$6BC0); pointers are
 * per-state, indexed on state-1. Returns the metasprite id.
 */
export function animTick(state, r) {
  const st = r[E_STATE];
  const facing = r[E_FACING];
  const f0 = r[E_FLAGS];
  if (f0 & 0x10) {                                  // $5F39: ranged-attack pose
    // $5F4F-$5F75: 2/7/8 have fixed tables; the DEFAULT arm (state 9) is the
    // one $C73F swaps to $6B7D -- not state 8, as an older comment claimed.
    const base = st === 2 ? 0x6AFD : st === 7 ? 0x6B1D : st === 8 ? 0x6B3D
      : (state.flow.bossCrit ? 0x6B7D : 0x6B5D);    // $5F5B
    return ar(state, base + ((r[0x14] & 0x3F) >> 2) + (facing << 4));
  }
  if (f0 & 0x08) {                                  // $5F85: melee pose
    let ptr = arw(state, 0x691B + (st - 1) * 2);
    if ((ptr >> 8) !== 0xFF) {                      // $5F98
      // $5F9D-$5FC0: the boss arms shift the pose row by $10. Airborne
      // (bit 0 or 1) it is boss 2's spin; grounded it is the CRIT swing,
      // gated on $C73F and skipped on level 14 ($C73E == 4).
      if (f0 & 0x03) {
        if (state.level.bossId === 2) ptr += 0x10;  // $5FBE
      } else if (state.flow.bossCrit && state.level.bossId !== 4) {
        ptr += 0x10;                                // $5FB2
      }
      return ar(state, ptr + ((r[0x14] & 0x1F) >> 2) + (facing << 3));
    }
    return walkCycle(state, r, facing);             // $5FDB
  }
  if (f0 & 0x01) {                                  // $5F24: rising pose
    return ar(state, arw(state, 0x68EF + (st - 1) * 2) + facing);
  }
  if (f0 & 0x02) {                                  // $5F0A: falling pose
    if (st === 7) return ar(state, 0x6B9D + facing);
    if (st === 1) return ar(state, 0x6B9F + facing);
    return ar(state, arw(state, 0x68EF + (st - 1) * 2) + facing);
  }
  if (f0 & 0x20) {                                  // $5E2B: idle sway
    let ptr = arw(state, 0x6A97 + (st - 1) * 2);
    // $5E3E-$5E4E: the STAGGERED Joker (bossId 4, $C73D still counting,
    // i.e. >= 2) sways from a row 8 further on -- the reeling poses.
    if (state.level.bossId === 4 && state.flow.bossRage >= 2) ptr += 8;
    return ar(state, ptr + ((state.frame & 0x18) >> 3) + facing * 4);
  }
  if (r[1] & 0x20) {                                // $5E61: landing animation
    if (r[0x19] === 0) { r[1] &= ~0x20; return r[6]; }     // $5E90
    r[0x19]--;
    return ar(state, arw(state, 0x69F3 + (st - 1) * 2) + ((r[0x19] & 0x0C) >> 2) + facing * 4);
  }
  if (r[1] & 0x40) {                                // $5EA0: turn animation
    if (r[0x18] === 0) {
      r[1] &= ~0x40;                                // $5ECF
      r[E_FLAGS] |= 0x01;                           // the jump launches NOW
      // $5ED8: on LEVEL 4 (the $FFB0 number, not $C73E) the expiry rolls a
      // crit: (rLY ^ $FFB1) < $80 sets $C741 and adds $10 to the launch
      // velocity -- boss 1's high spinning hop. rLY at this roll MEASURED
      // mid-frame every time (43/45/43/59 over four hops on the 400-frame
      // level-4 idle run), always < $80, so the XOR's high bit is $FFB1's
      // high bit and the roll reduces EXACTLY to `$FFB1 < $80`: a coin flip
      // that flips every 128 frames, deterministic given the frame counter.
      // All four measured outcomes agree (125/50 -> crit, 221/146 -> plain).
      if (state.level.number === 4 && state.frame < 0x80) {
        state.flow.bossHop = 1;                     // $5EEA: $C741
        r[0x13] = u8(r[E_JUMP_VEL] + 0x10);         // $5EF2
        return r[6];
      }
      r[0x13] = r[E_JUMP_VEL];                      // $5EF6: jump velocity
      return r[6];
    }
    r[0x18]--;
    return ar(state, arw(state, 0x6A53 + (st - 1) * 2) + ((r[0x18] & 0x0C) >> 2) + facing * 4);
  }
  return walkCycle(state, r, facing);
}

/** ROM: loc_01_5FE6 - r[3] = period<<4|subtimer, r[4] = (frames-1)<<4|frame. */
function walkCycle(state, r, facing) {
  const period = r[E_ANIM_TIMER] >> 4;
  const sub = (r[E_ANIM_TIMER] & 0x0F) + 1;
  let frame;
  const hi = r[E_ANIM_FRAME] >> 4;
  if (sub < period) {                               // $5FF5 -> $601C
    r[E_ANIM_TIMER] = (period << 4) | sub;
    frame = r[E_ANIM_FRAME] & 0x0F;
  } else {
    r[E_ANIM_TIMER] = period << 4;                  // $5FF9
    frame = (r[E_ANIM_FRAME] & 0x0F) + 1;
    if (frame < hi + 1) r[E_ANIM_FRAME] = (hi << 4) | frame;   // $6013
    else { frame = 0; r[E_ANIM_FRAME] = hi << 4; }  // $6009
  }
  // $602A: offset = facing * frames + frame (the ADD loop), frames = hi+1.
  let idx = arw(state, 0x6891 + (r[E_STATE] - 1) * 2) + facing * (hi + 1) + frame;
  // $6046-$605A: on level 14, a state-9 record with $C741 set reads its walk
  // poses 4 further on -- the Joker's cane-out row. $C741 here is the band
  // flag boss4Walk/the retreat maintain, not the boss-1/2 meaning.
  if (state.level.number === 0x0E && state.flow.bossHop !== 0 && r[E_STATE] === 9) {
    idx += 4;
  }
  return ar(state, idx);
}

export function queueDraw(state, id, r, attr, alt) {
  if (!state.enemyDraws) state.enemyDraws = [];
  // 1:$6063-$6071 writes the record's cached Y and THEN, when the enemy is
  // GROUNDED, calls sub_00_0F56 on the copy heading for the draw. So the bob
  // rides on the queued sprite and NOT on r[8] -- r[8] stays the value every
  // hit test compares against.
  //
  // THE GATE BYTE IS r[0], NOT r[1]. $6069 is `LD DE,$FFFA / ADD HL,DE` and
  // $606A reads (HL): MEASURED by hooking 1:$606A over 600 frames of level 9,
  // HL lands on record offset +0 on 289 of 289 calls. Offset +0 is the flags
  // byte whose bits 0-1 are the air state -- the same `r[0] & 0x03` that
  // batarang.js tests for an airborne boss 2.
  //
  // Reading r[1] instead made the test almost always true, so the port bobbed
  // AIRBORNE enemies that the cartridge exempts. Reported from play as the
  // train levels flickering "up and down like crazy" while the real game looked
  // calmer -- on level 9 the most-watched sprite is the diving flyer, which the
  // cartridge glides smoothly and the port popped 3 px every 8th frame.
  // MEASURED cost: 19 frames of a 600-frame level-9 run had one 3x3 enemy block
  // at port Y = cart Y - 3, every one of them on a $FFB1 & 7 == 0 frame, with
  // the enemy records byte-identical on both sides (f76 slot 0 flags $81 -> &3
  // = 1 -> the cartridge skips). Zero frames where the cartridge bobbed and the
  // port did not.
  //
  // LEFT AS THE RAW +0, and it is the ONLY site the Phase-8 sweep skipped.
  // tests/raster.test.js greps this exact expression and asserts the operand
  // digit is 0. Writing E_FLAGS here would force that test to accept the name
  // instead of the number, which makes it agree with the code by construction
  // -- and the whole reason it exists is that the port once shipped r[1] here
  // while every drawYBob unit test stayed green.
  const bob = drawYBob(state, (r[0] & 0x03) === 0);
  state.enemyDraws.push({ id, x: r[E_SCREEN_X], y: u8(r[E_SCREEN_Y] + bob), attr, alt });
}

/**
 * Flush the frame's queued enemy sprites. ROM: sub_00_0BC6 pushes during the
 * enemy driver itself; queueing keeps that OAM order (parity-alternating slot
 * order included) while letting main.js own the manifest. Levels $04/$0B/$0E
 * draw from the alternate table 5:$736B (sub_00_0BAF), the rest from 5:$5F5C.
 * @param {GameState} state
 */
export function drawEnemies(state, manifest) {
  const q = state.enemyDraws;
  if (!q || !manifest.metasprites) return;
  for (const d of q) {
    const table = d.alt ? manifest.metasprites.table2 : manifest.metasprites.table1;
    // r[7]/r[8] are OAM coordinates (+8, +16); the sprite queue is in screen
    // coordinates, so the hardware offsets come back off here.
    drawMetasprite(state, table, d.id, d.x - 8, d.y - 16, d.attr);
  }
  q.length = 0;
}

/**
 * Metasprite-id tables, 1:$6891-$6BC0: per-state pointer rows (walk $6891,
 * rise/fall $68EF, melee $691B, landing $69F3, turn $6A53, idle $6A97,
 * projectile variants $6AF3, ranged poses $6AFD+). Byte-verified against the
 * ROM. `ar`/`arw` read a byte / little-endian pointer by ROM address.
 */
// Indexed by ROM ADDRESS, which is why the base travels with the table.
// A missing table would make every `ar(state, )` return 0, and 0 is a valid
// metasprite id -- so every enemy would draw pose 0 and look plausible.
// Refuse to guess instead.
function animTable(state) {
  const t = state.tables?.enemyAnim;
  if (!t) throw new Error('enemies: tables.enemyAnim missing from the manifest');
  return t;
}
export const ar = (state, addr) => animTable(state)[addr - state.tables.enemyAnimBase] ?? 0;
export const arw = (state, addr) => ar(state, addr) | (ar(state, addr + 1) << 8);
