// The $C6CF ballistic pool -- what a dying enemy leaves behind.
//
// ROM: allocator sub_00_0CF3, integrator loc_00_1444-$1625, spawned from the
// enemy driver at 1:$4E84. Four slots, eight bytes each.
//
// This is the health economy of the whole game. Every enemy killed on a
// non-boss level throws a heart out of its body; it arcs up, bounces off the
// floor with three quarters of its impact speed, comes to rest, blinks, and
// expires. Walking into it is +1 HP. Without it the game is meaningfully
// harder than the cartridge, because the ONLY other way to heal is the three
// fixed pickup cells stamped into the map.
//
// MEASURED on the cartridge (tools/oracle/drops.py), not read off the listing:
//
//   level 3, enemy slot 1 killed at x=$0981 y=$1200
//     f0   kind $01  y $1200  vy $20      <- spawned at the enemy's position
//     f10  ..        y $1165  vy $02      <- apex
//     f26  ..        y $12DD  vy $D2
//     f27  ..        y $130E  vy $25      <- first bounce
//     f50  ..        y $12F7  vy $E0
//     f51  ..        y $131A  vy $1B      <- second, weaker
//     f83  kind $FF  y $1304  vy $F9      <- at rest, counter starts at $FF
//     then $FE, $FD ... one step every OTHER frame ($FFB1 bit 0)
//
//   and with the player standing on it at HP 3/10:  3 -> 4, slot freed.
//
// The bounce arithmetic is worth spelling out because it is easy to get one
// frame wrong: gravity is applied FIRST, so the $D2 above is already $CF when
// the rebound is computed, and $CF is -49; 49 - (49 >> 2) = 37 = $25, which is
// exactly what the next frame shows. Same for the second bounce: $E0 - 3 =
// -35, 35 - 8 = 27 = $1B.
//
// Two levers decide whether a drop exists at all, both confirmed by probe:
//   - $C73E (boss id) nonzero -> NO drop. Measured on levels 4, 8 and 11: the
//     pool stays empty when their enemies die.
//   - falling out of the world (Y hi >= $21, $4E69) -> no drop either; that
//     arm jumps straight to the kill and never reaches the allocator.

import { u8, i8, u16, mapCollision } from './state.js';
import { drawMetasprite } from './render/metasprite.js';

export const SLOTS = 4;
export const RECORD = 8;

/** ROM: $146A -- the per-frame pull, and $1474 the terminal speed. */
const GRAVITY = 3;
const TERMINAL = 0xA0;                  // -96 as a byte

/** ROM: $152D -- a rebound slower than this stops the bouncing for good. */
const BOUNCE_FLOOR = 0x08;

/** ROM: $1557 -- below this the resting drop blinks instead of drawing. */
const BLINK_BELOW = 0xB0;

/** ROM: $1620 / $161C -- the two sprites this pool can wear. */
const SPRITE_PICKUP = 0x96;
const SPRITE_HAZARD = 0xB7;

/** ROM: $15C4 -- sub_00_0C88 with HL = $0C14, a 12 x 20 box, compares
 *  INCLUSIVE on both axes (the `JR Z` arms accept exact equality). */
const BOX_X = 0x0C, BOX_Y = 0x14;

/** ROM: $15AD/$15B1 -- outside these rows a drop is neither drawn nor taken. */
const ROW_MIN = 0x11, ROW_MAX = 0x21;

/** ROM: $15A1 -- sub_00_11A7, the same X window the enemy despawn uses. */
const OFFSCREEN_RANGE = 9;

/** ROM: $15E5 -- contact damage from a hazard drop, and $15EF/$15F3 the
 *  knockback stamp. Both are the same 90-frame count; bit 7 carries the
 *  direction, and $FF88 == 0 (facing right) is the one that sets it. */
const HAZARD_DAMAGE = 2;
const KNOCKBACK_FACING_RIGHT = 0xDA, KNOCKBACK_FACING_LEFT = 0x5A;

export function createDrops() {
  return Array.from({ length: SLOTS }, () => new Uint8Array(RECORD));
}

/**
 * ROM: sub_00_0CF3. First free slot wins; a full pool silently drops the
 * request, which is the real reason a kill "sometimes" yields nothing.
 *
 * `dir` is the $C74D staging byte and `sub` the D register. The enemy death
 * site passes dir = $FF and sub = 0, so an enemy heart has no sideways drift
 * and is the harmless kind -- but the allocator is general, and the other
 * combinations are what the hazard variants use.
 */
export function spawnDrop(state, x, y, dir = 0xFF, sub = 0x00, e = 0x00) {
  for (let i = 0; i < SLOTS; i++) {
    const r = state.drops[i];
    if (r[0] !== 0) continue;                       // $0D01: slot busy
    r[0] = (e & 1) ? 0xFF : 0x01;                   // $0D03
    r[1] = (x >> 8) & 0xFF;                         // $0D0E: from $C749
    r[2] = x & 0xFF;
    r[3] = (y >> 8) & 0xFF;
    r[4] = y & 0xFF;
    // $0D21: the staging byte picks the horizontal drift, not the caller.
    r[5] = dir === 0xFF ? 0x00 : (dir === 0x01 ? 0xF8 : 0x08);
    r[6] = (e & 1) ? 0x00 : ((sub & 1) ? 0x38 : 0x20);   // $0D33
    r[7] = sub & 0xFF;                              // $0D45
    return i;
  }
  return -1;                                        // $0D4F: pool full
}

export function clearDrops(state) {
  for (const r of state.drops) r.fill(0);
}

/** ROM: sub_00_11A7 -- X-only, and the same window the enemy driver uses. */
function offScreenX(state, xhi) {
  const camCol = u8((state.camera.x >> 8) + 5);
  const d = camCol >= xhi ? camCol - xhi : xhi - camCol;
  return (d & 0xFF) >= OFFSCREEN_RANGE;
}

/**
 * ROM: sub_00_0AE1. B is the SOUND ID and C the mask -- so `LD BC,$1601` is
 * id $16, mask $01, not the other way round. Getting these the wrong way up
 * is silent-ish rather than obviously broken: the pickup still made *a*
 * noise, just sound $01's, which is why it took someone saying "that chime
 * sounds wrong" to catch it.
 */
function requestSound(state, id, mask = 0x01) {
  if (state.sound && state.sound.queue.length < 4) state.sound.queue.push({ id, mask });
}

/**
 * ROM: loc_00_1444. One pass over all four slots, called from the player
 * chain at $1444 (between $1438 and $1626), NOT from the enemy driver.
 */
export function updateDrops(state, manifest) {
  for (let i = 0; i < SLOTS; i++) {
    const r = state.drops[i];
    if (r[0] === 0) continue;                       // $1452: free

    // $1457: paused freezes the physics but NOT the contact test, so a drop
    // can still be collected on the frame the pause is released.
    if (!state.flow.paused) {
      if (r[0] & 0x80) restTick(state, r);          // $145E: BIT 7 -> $1547
      else if (!flyTick(state, r)) continue;        // returns false = slot gone
    }
    contactOrDraw(state, r, manifest);
  }
}

/**
 * ROM: $1464-$1544. The airborne arm.
 * @returns false if the slot was freed or abandoned this frame.
 */
function flyTick(state, r) {
  // $1469: gravity, then the clamp -- and the clamp only applies once the
  // velocity has gone negative, because $146B tests the sign first.
  let vy = u8(r[6] - GRAVITY);
  if ((vy & 0x80) && vy < TERMINAL) vy = TERMINAL;  // $146F/$1473
  r[6] = vy;

  // $1477-$14B4: position -= velocity, both axes, sign-extended to 16 bits.
  const y = u16(((r[3] << 8) | r[4]) - i8(vy));
  r[3] = y >> 8; r[4] = y & 0xFF;
  const x = u16(((r[1] << 8) | r[2]) - i8(r[5]));
  r[1] = x >> 8; r[2] = x & 0xFF;

  // $14B9: BIT 7 of the VELOCITY byte -- while it is still rising there is no
  // terrain test at all, which is why a drop passes up through a ceiling.
  if ((vy & 0x80) === 0) return true;

  if (r[3] >= 0x20) return false;                   // $14C6: below the world
  if (mapCollision(state, r[1], r[3]) === 0) return true;   // $14D3: still air

  if (r[7] !== 0) {                                 // $14DC: a hazard shatters
    r[0] = 0;                                       // $14E3
    requestSound(state, 0x17, 0x01);                // $14FC: BC = $1701
    return false;
  }

  // $1505: a second probe $40 subpixels higher. If THAT is solid too the drop
  // is inside terrain rather than on top of it, and it vanishes instead of
  // bouncing out of a wall.
  if (mapCollision(state, r[1], (y - 0x40 >> 8) & 0xFF) !== 0) {
    r[0] = 0;                                       // $153A
    return false;
  }

  // $1524: rebound at three quarters, and below $08 it stops bouncing and
  // becomes a resting pickup. Note this reads the velocity AFTER gravity.
  const mag = u8(-i8(vy));
  const rebound = u8(mag - (mag >> 2));
  if (rebound >= BOUNCE_FLOOR) r[6] = rebound;      // $1544
  else r[0] = 0xFF;                                 // $1535: at rest
  return true;
}

/**
 * ROM: loc_00_1547. The resting arm: a lifetime counter, a blink, a check
 * that the ground is still there, and conveyor carry.
 */
function restTick(state, r) {
  // $1548: the counter only steps on frames where $FFB1's low bit is clear,
  // so the full $7F takes about four and a half seconds.
  if ((state.frame & 1) === 0) {
    const n = u8((r[0] & 0x7F) - 1);
    r[0] = n === 0 ? 0 : (n | 0x80);                // $1552: 0 frees the slot
    if (r[0] === 0) return;
  }

  const coll = mapCollision(state, r[1], r[3]);
  if (coll === 0) { r[0] &= 0x7F; return; }         // $156F: ground gone, fall

  // $1573: the only two cell types a resting drop reacts to.
  let dx = 0;
  if (coll === 0x02) dx = 4;                        // $1580: conveyor right
  else if (coll === 0x03) dx = -4;                  // $157B: conveyor left
  if (dx) {
    const x = u16(((r[1] << 8) | r[2]) + dx);       // $1583
    r[1] = x >> 8; r[2] = x & 0xFF;
  }
}

/** ROM: loc_00_1590 -- the shared tail: take it, or draw it. */
function contactOrDraw(state, r, manifest) {
  if (offScreenX(state, r[1])) return;              // $15A5
  if (r[3] < ROW_MIN || r[3] >= ROW_MAX) return;    // $15AD/$15B1

  // $15B7: sub_00_1172, the same +8/+16 OAM convention everything else uses.
  const sx = u8((u16(((r[1] << 8) | r[2]) - state.camera.x) >> 4) + 8);
  const sy = u8((u16(((((r[3] << 8) | r[4]) & 0x0FFF)) - state.camera.y) >> 4) + 0x10);

  // $FF93/$FF94 -- READ, not recomputed. This pass runs at $1444, ahead of the
  // player update whose tail ($1B58) writes them, so the correct value is LAST
  // frame's. Recomputing here pairs last frame's player with this frame's
  // camera and lands up to 2 px out; measured on a moving camera, that is the
  // difference between taking a heart and sailing past it, because $0C88's
  // compare accepts equality at exactly 12. See cachePlayerScreen().
  const px = u8(state.video.playerScreenX ?? 0);
  const py = u8(state.video.playerScreenY ?? 0);
  const dx = sx >= px ? sx - px : px - sx;
  const dy = sy >= py ? sy - py : py - sy;

  // $15CB: inclusive on both axes.
  if (dx <= BOX_X && dy <= BOX_Y) {
    r[0] = 0;                                       // $15CF: taken either way
    if (r[7] & 1) hazardHit(state, r);              // $15D5
    else {
      requestSound(state, 0x16, 0x01);              // $15FF: BC = $1601
      const p = state.player;
      if (p.hp < p.hpMax) p.hp += 1;                // $1608: CP B / JR NC
    }
    return;
  }

  const table = manifest?.metasprites?.table1;
  if (!table) return;
  // $1557: once the lifetime drops below $B0 the drop is only drawn on the
  // frames where bit 2 of its own counter is set -- that is the blink.
  if ((r[0] & 0x80) && (r[0] & 0x7F) < (BLINK_BELOW & 0x7F) && !(r[0] & 0x04)) return;
  drawMetasprite(state, table, (r[7] & 1) ? SPRITE_HAZARD : SPRITE_PICKUP,
                 sx - 8, sy - 16, 0);
}

/** ROM: $15D9 -- guarded by the death flag and the knockback timer alike, so
 *  a hazard cannot re-hit while the previous hit is still playing out. */
function hazardHit(state, r) {
  const p = state.player;
  if (p.dead) return;                               // $15D9: $C715
  if (p.iframes) return;                            // $15DF: $C714
  p.hp = Math.max(0, p.hp - HAZARD_DAMAGE);         // $15E5: sub_00_2777, B = 2
  p.iframes = p.facing ? KNOCKBACK_FACING_LEFT : KNOCKBACK_FACING_RIGHT;
}
