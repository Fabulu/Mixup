// Shared physics tails: rise -> fall -> land -> screen/anim.
//
// ROM range: loc_01_5BB6 (rise), loc_01_5C15 (fall) and loc_01_5CA8 with the
// draw path $5CD3-$6063 (screen-byte recompute, the projectile and boss
// special draws, the blink gate, the animation-machine call and the queue
// push).
//
// THE THREE FALL THROUGH EACH OTHER, exactly as the ROM does: riseTail ends in
// fallTail ends in screenTail. Every state handler funnels in at one of the
// three, and which one it enters at is the handler's own ROM entry point --
// that is why they are three exported functions and not one.
//
// The boss-1 ($5D4A) and boss-2 ($5D20) special draw arms stay INLINE here.
// They look like they belong in the boss modules; the ROM has them inline,
// ahead of the blink gate at $5DE1 and ahead of the animation machine, and
// moving them behind a per-boss hook would preserve behaviour today while
// destroying the visible ordering that makes the listing checkable against the
// disassembly.

import { u8, i8, u16 } from '../state.js';
import { addY, absDiff8 } from './util.js';
import { probeUp, probeDown, attackProbe } from './probe.js';
import { animTick, queueDraw, ar } from './anim.js';

/**
 * ROM: loc_01_5BB6. Rising phase: gravity 1/frame, apex flips to falling,
 * ceiling probe can snap the head back down. Suspended while the turn
 * animation runs (that is what delays a wall jump until the turn completes).
 */
export function riseTail(state, r) {
  if ((r[0] & 0x01) && (r[1] & 0x40) === 0) {
    const v = u8(r[0x13] - 1);                      // $5BC8
    if (v === 0) r[0] = (r[0] & ~0x01) | 0x02;      // $5BCC: apex
    r[0x13] = v;
    addY(r, -i8(v));                                // $5BE3: Y -= vel
    const coll = probeUp(state, r);                 // sub_01_64FA
    if (coll !== 0) {
      if (coll !== 0xFF) {                          // $5BF0 (64FA never returns $FF)
        r[0x10] = u8(r[0x10] + 1);                  // $5C01: push down a row
        r[0x11] = r[0x1A];                          // snap to the blob's head line
      }
      r[0x13] = 0;                                  // $5C06
      r[0] = (r[0] & ~0x01) | 0x02;                 // $5C0B
    }
  }
  return fallTail(state, r);
}

/**
 * ROM: loc_01_5C15. Falling: gravity 3/frame toward terminal $BB (-69), or
 * $F8 (-8) for slow-fall records (r[1] bit 1). Grounded records skip gravity
 * but still probe the floor -- walking off a ledge starts the fall here.
 */
export function fallTail(state, r) {
  if (r[0] & 0x02) {
    const term = (r[1] & 0x02) ? 0xF8 : 0xBB;       // $5C25 / $5C29
    let v = u8(r[0x13] - 3);
    if (v < term) v = term;                         // $5C32: unsigned clamp
    r[0x13] = v;
    addY(r, -i8(v));
  }
  const res = probeDown(state, r);                  // sub_01_656A
  if (res === 0) {
    if ((r[0] & 0x03) === 0) {                      // $5C57: ground vanished
      r[0] |= 0x02;
      r[1] &= ~0x60;                                // $5C62
    }
  } else {
    r[0x13] = 0;                                    // $5C6E
    if (r[0] & 0x02) {                              // $5C74: landed from a fall
      r[1] |= 0x20;                                 // landing animation
      r[0x19] = 0x0C;
    }
    r[0] &= ~0x03;                                  // $5C87
    // $5C8F: `CP $0A` -- level 10 ONLY. Its lower half is water and enemies
    // below row $14 draw behind the surface.
    //
    // Levels 5 and 13 have water collision too and do NOT get this, which
    // looks like an omission and is not. MEASURED on the cartridge over a
    // 700-frame walk: level 5's live enemy holds attr 0 for the whole run
    // while level 10's flip between 0 and $80. So an enemy standing in
    // level-5 water really does draw IN FRONT of it on the real hardware.
    if (state.level.number === 0x0A && r[0x10] >= 0x14) r[9] = 0x80;
  }
  return screenTail(state, r);
}

/**
 * ROM: loc_01_5CA8 plus the draw path ($5CD3-$6063).
 *
 * Every handler funnels through here. It recomputes the stored screen
 * coordinates (which next frame's distance checks read -- they are one frame
 * stale by design), then runs the ANIMATION state machine, which is not
 * cosmetic: the turn animation's expiry is what actually launches the wall
 * jump. The machine is skipped -- jumps delayed! -- whenever the enemy is
 * outside the 7-row vertical window, on the dark frames of the hit blink, or
 * while paused. The selected metasprite id lands in r[6] ($6063) and the draw
 * is queued for drawEnemies(), preserving the ROM's OAM push order.
 */
export function screenTail(state, r) {
  const x = (r[0x0E] << 8) | r[0x0F];
  const y = (r[0x10] << 8) | r[0x11];
  r[7] = u8((u16(x - state.camera.x) >> 4) + 8);            // sub_00_1172
  r[8] = u8((u16((y & 0x0FFF) - state.camera.y) >> 4) + 0x10);

  if (absDiff8(u8((state.camera.y >> 8) + 4), r[0x10]) >= 7) return;   // $5CCA
  const lvl = state.level.number;
  if (r[2] === 0x0B) {                              // $5CD4: projectile draw
    const base = [0x6AF3, 0x6AF5, 0x6AF7, 0x6AF9][r[6] - 1] ?? 0x6AFB;  // $5CDD
    queueDraw(state, ar(state, base + r[5]), r, 0,         // $5D13 / $5D1A
              lvl === 0x0B || lvl === 0x0E);
    return;
  }
  // $5D20: boss 2's batarang-spin draw. While $C741 holds (the handler head
  // counts it down), the metasprite is $6BA3[facing] with attr 0 via the
  // table-1 path -- the animation machine and blink are skipped entirely.
  if (state.level.bossId === 2 && state.flow.bossHop) {
    queueDraw(state, ar(state, 0x6BA3 + (r[5] & 1)), r, 0, false);   // $5D2D-$5D47
    return;
  }
  // $5D4A: boss 1's crit-hop draw. While $C741 holds, the metasprite comes
  // from a HEIGHT-indexed pose table -- $6BA5 rising, $6BB3 otherwise,
  // indexed |$18 - Yhi| -- instead of the animation machine, and r[6] is NOT
  // updated. On the falling half the spin also attacks BOTH sides: probe at
  // +$10 ahead, facing flipped +$10 behind, then offset 0 at its own centre,
  // facing restored ($5D8D-$5DC2). Landing anim or a stun clears the flag.
  if (state.level.bossId === 1 && state.flow.bossHop) {
    if ((r[1] & 0x20) || (r[0] & 0x04)) {           // $5D5B / $5D61
      state.flow.bossHop = 0;                       // $5DD7
    } else {
      const id = ar(state, ((r[0] & 0x01) ? 0x6BA5 : 0x6BB3)      // $5D6B-$5D74
                    + absDiff8(0x18, r[0x10]));            // $5D77-$5D84
      if (r[0] & 0x02) {                            // $5D8D: falling
        r[0x1E] = 0x10;                             // $5D95
        attackProbe(state, r);                      // $5D9C
        r[5] ^= 1;                                  // $5DA6
        attackProbe(state, r);                      // $5DAB
        r[0x1E] = 0;                                // $5DB4
        attackProbe(state, r);                      // $5DB8
        r[5] ^= 1;                                  // $5DC0
      }
      queueDraw(state, id, r, r[9], true);          // $5DD1: sub_00_0BAF
      return;
    }
  }
  if ((r[0] & 0x04) && (state.frame & 0x08) === 0) return;   // $5DE1: blink
  const alt = lvl === 4 || lvl === 0x0B || lvl === 0x0E;     // $6078 -> 0BAF
  if (state.flow.paused) {                          // $5DF1: draw, no anim tick
    queueDraw(state, r[6], r, r[9], alt);
    return;
  }
  const id = animTick(state, r);
  r[6] = id;                                        // $6063
  // ($606D: sub_00_0F56 bobs the DRAWN Y of a grounded enemy by -2/-3 every
  //  8th frame on levels 6/9/10/11 -- draw-only, not modelled.)
  queueDraw(state, id, r, r[9], alt);
}
