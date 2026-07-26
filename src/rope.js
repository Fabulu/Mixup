// Bat-rope (grapple + swing).  ROM: armed at loc_00_1944, driven from the tail
// of the projectile routine at loc_00_3D5F, drawn by loc_01_4072.
//
// The rope is a chain of SIX positions in a 4-byte-per-slot array at $C5EB,
// each a pair of 12.4 world coordinates stored big-endian:
//
//   slot 5  the hand -- seeded from the player when the rope is armed
//   slot n  links, filled in from 4 downwards as the rope extends
//   slot 6  NOT a real slot: the loop runs one past the end and, instead of
//           writing a position, dumps its delta into the platform-carry
//           registers $C72F/$C730. That is how the swing moves Batman -- he is
//           carried by the rope exactly the way a moving platform carries him.
//
// $C71E is the state: 1 extending, 2 swinging, 3 retracting, 4 the pause at the
// extreme of a swing. $FFB4 counts DOWN from 5 as the rope extends, so once it
// anchors $FFB4 is the index of the anchored tip.

import { u16, i8, mapCollision } from './state.js';
import { cameraPixels } from './camera.js';
import { drawMetasprite } from './render/metasprite.js';

// Spelled out rather than imported from player.js: state.js pulls createRope in
// from here, so importing back out of player.js would close a cycle that only
// works by accident of evaluation order.
const BTN_A = 0x01;

export const SLOTS = 7;             // 0..5 real, 6 is the player pseudo-slot
const HAND = 5;

/**
 * Swing tables, 50 entries each.  ROM: 1:$41C0 (X) and 1:$41F2 (Y).
 *
 * X is a symmetric hump peaking at $8D -- fastest through the bottom of the
 * arc. Y is signed: positive (falling) for the first half, negative (rising)
 * for the second, which is what gives the launch its upward kick.
 */
const X_TABLE = [
  0x0D, 0x11, 0x15, 0x19, 0x1D, 0x21, 0x26, 0x2A, 0x2F, 0x34,
  0x39, 0x3F, 0x44, 0x4A, 0x50, 0x56, 0x5C, 0x62, 0x69, 0x6F,
  0x75, 0x7C, 0x82, 0x88, 0x8D, 0x8D, 0x88, 0x82, 0x7C, 0x75,
  0x6F, 0x69, 0x62, 0x5C, 0x56, 0x50, 0x4A, 0x44, 0x3F, 0x39,
  0x34, 0x2F, 0x2A, 0x26, 0x21, 0x1D, 0x19, 0x15, 0x11, 0x0D,
];
const Y_TABLE = [
  0x0D, 0x10, 0x14, 0x17, 0x1A, 0x1D, 0x20, 0x22, 0x24, 0x26,
  0x28, 0x29, 0x29, 0x2A, 0x29, 0x29, 0x27, 0x25, 0x23, 0x20,
  0x1C, 0x17, 0x11, 0x0B, 0x03, 0xFD, 0xF5, 0xEF, 0xE9, 0xE4,
  0xE0, 0xDD, 0xDB, 0xD9, 0xD7, 0xD7, 0xD6, 0xD7, 0xD7, 0xD8,
  0xDA, 0xDC, 0xDE, 0xE0, 0xE3, 0xE6, 0xE9, 0xEC, 0xF0, 0xF3,
];

/** Link metasprites, 5 per facing.  ROM: 1:$4224. */
const LINK_IDS = [0x2A, 0x2B, 0x2C, 0x2E, 0x2D,
                  0x2D, 0x2E, 0x2C, 0x2B, 0x2A];
/** Hook head, by facing.  ROM: 1:$422E. */
const HOOK_IDS = [0x0A, 0x0B];

const PHASE_END = 0x32;             // $4188
const REACH = 0x0060;               // $3DB5 -- 6 px per extension step

export function createRope() {
  return {
    slots: Array.from({ length: SLOTS }, () => ({ x: 0, y: 0 })),
    dx: 0,          // $C727/$C728, sign-extended swing delta
    dy: 0,          // $C729/$C72A
    flip: 0,        // $C720
    delay: 0,       // $C721
    cur: 0,         // $C722, the slot the physics loop is on
    saveX: 0,       // $C723, last frame's carry X
    saveY: 0,       // $C724
  };
}

/**
 * ROM: loc_00_1944.  Up arms the rope.
 *
 * The hand offset is asymmetric -- +4 px facing right but -12 px facing left --
 * because the player's origin sits at the left edge of the sprite.
 */
export function startRope(state) {
  const p = state.player;
  const r = state.rope;

  requestSound(state, 0x10);
  p.action = 1;                                  // $194C
  p.attackPose = 1;                              // $194F
  p.attackTimer = 1;                             // $1952
  p.ropeLength = 0;                              // $1955
  r.delay = 1;                                   // $195A
  p.ropeSegments = state.tunables.ropeSegments;  // $195F: 5

  r.slots[HAND].x = u16(p.x + (p.facing === 0 ? 0x0040 : 0xFF40));  // $196F/$1974
  r.slots[HAND].y = u16(p.y + 0xFEC0);                              // $1984
}

/**
 * ROM: loc_00_3D5F.  One rope frame -- physics AND drawing, because the
 * original interleaves them.
 */
export function updateRope(state, manifest) {
  const p = state.player;
  if (p.action === 0) return;                    // $3D64

  if (state.flow.paused) { drawRope(state, manifest); return; }   // $3D69

  if (p.action === 2) { swing(state, manifest); return; }         // $3D6F
  if (p.action === 3) { retract(state, manifest); return; }       // $3D74
  if (p.action === 4) { drawRope(state, manifest); return; }      // $3D79

  extend(state, manifest);
}

/**
 * ROM: $3D7C-$3E10.  Grow the rope one link per two frames until it either
 * finds something to bite or runs out of segments.
 */
function extend(state, manifest) {
  const p = state.player;
  const r = state.rope;

  if (r.delay !== 0) {                           // $3D80
    r.delay--;
    drawRope(state, manifest);
    return;
  }

  const n = p.ropeSegments - 1;                  // $3D8B
  if (n < 0) {                                   // $3D8D: the SUB borrowed
    p.action = 3;
    retract(state, manifest);
    return;
  }
  p.ropeSegments = n;
  r.delay = 1;                                   // $3D99

  // $3DA6-$3DDE: the new link is one step up and forward from the previous one.
  const src = r.slots[n + 1];
  const link = r.slots[n];
  link.x = u16(src.x + (p.facing === 0 ? REACH : -REACH));
  link.y = u16(src.y - REACH);

  // $3DE3: does the new tip sit in something solid?
  const coll = mapCollision(state, link.x >> 8, link.y >> 8);
  if (coll === 0 || coll === 0x07) { drawRope(state, manifest); return; }  // $3DE9/$3DEC
  // $3DF1: collision $FD is scenery the rope passes through -- but only on
  // level 1, where the same value means something else.
  if (coll === 0xFD && state.level.number === 1) { drawRope(state, manifest); return; }

  // $3DFC: bite.
  requestSound(state, 0x11);
  p.action = 2;
  p.ropeLength = 0;                              // $3E08
  r.flip = 0;                                    // $3E0B
  p.vx = 0;                                      // $3E0E
  p.vy = 0;                                      // $3E10
  swing(state, manifest);
}

/**
 * ROM: loc_00_3E12.  The pendulum.
 *
 * Every link moves by the phase's table delta scaled by its distance from the
 * anchor, so the far end sweeps furthest -- a cheap, convincing arc.
 */
function swing(state, manifest) {
  const p = state.player;
  const r = state.rope;

  if (state.input.pressed & BTN_A) { release(state); return; }   // $3E12

  const anchor = p.ropeSegments;
  const phase = p.ropeLength;

  // $3E38: X. Facing right stores the raw table byte; facing left stores its
  // negation AND forces the sign byte to $FF even when the delta is zero --
  // release() reads that sign byte, so the difference is load-bearing.
  const xd = X_TABLE[phase];
  let stepX;
  if (p.facing === 0) {
    r.dx = xd;                                   // $C727 = $00
    stepX = (xd & 0xF0) >> 4;                    // $3E41
  } else {
    r.dx = (-xd) & 0xFFFF;                       // $C727 = $FF
    stepX = -((xd & 0xF0) >> 4);                 // $3E59: negated AFTER the shift
  }
  const a = r.slots[anchor];
  a.x = u16(a.x + stepX);                        // $3E70

  // $3E8C: Y. The double-negate idiom at $3EA0 truncates toward zero rather
  // than flooring, so a small negative delta steps by nothing at all.
  const yd = Y_TABLE[phase];
  r.dy = (yd & 0x80) ? (0xFF00 | yd) : yd;
  const stepY = (yd & 0x80) ? -(((-yd) & 0xFF) >> 4) : (yd & 0xF0) >> 4;
  a.y = u16(a.y + stepY);                        // $3EBC

  // $3EC4: walk outward from the anchor, scaling by distance.
  for (let i = anchor + 1, e = 1; ; i++, e++) {
    r.cur = i;
    if (!step(state, i, e)) return;              // carry-Y bailout -> release
    if (i >= 6) break;                           // $3FC9
  }

  drawRope(state, manifest);
}

/**
 * One slot of the physics loop.  ROM: loc_00_3EC9.
 *
 * @returns false if the carry-Y guard fired, which releases the rope.
 */
function step(state, i, e) {
  const r = state.rope;
  const slot = r.slots[i];
  const player = i === 6;

  // --- X ($3EDC-$3F4B) ---
  const dx = scaleDelta(r.dx, e);
  if (!dx.skip) {
    if (player) state.carry.x = i8((state.carry.x + dx.v) & 0xFF);        // $3F0A
    else slot.x = u16(slot.x + s16(dx.v));
  }

  // --- Y ($3F51-$3FC6) ---
  const dy = scaleDelta(r.dy, e);
  if (!dy.skip) {
    if (player) {
      // $3F80: a carry already pushing UP aborts the whole swing. And note
      // this ASSIGNS where the X axis added -- the asymmetry is the ROM's.
      if (state.carry.y & 0x80) { release(state); return false; }
      state.carry.y = i8(dy.v & 0xFF);           // $3F84
    } else {
      slot.y = u16(slot.y + s16(dy.v));
    }
  }
  return true;
}

/**
 * ROM: $3EE7-$3F3D.  delta * e, then >> 4.
 *
 * Kept at byte level on purpose: the negative path negates with the CPL/CPL/INC
 * idiom that drops the carry when the low byte is $00 (docs/03-VERIFICATION.md
 * item 16), and it SKIPS the add entirely when the scaled result truncates to
 * zero rather than adding nothing -- which for the player pseudo-slot means the
 * platform carry is left alone that frame instead of being cleared.
 */
function scaleDelta(d16, e) {
  // $3EDC: HL is SEEDED with the delta and then accumulated e more times, so
  // the multiplier is e + 1. Off by one here and every link moves at the wrong
  // rate -- the anchor is x1, the next link x2, and so on outward.
  let v = d16;
  for (let i = 0; i < e; i++) v = (v + d16) & 0xFFFF;   // $3EE7: repeated ADD

  if ((v & 0x8000) === 0) {                             // $3EEF: BIT 7, B
    return { v: (v >> 4) & 0xFFFF, skip: false };
  }
  const n = neg16q(v);                                  // $3F13
  const sh = (s16(n) >> 4) & 0xFFFF;                    // SRA B / RRA x4
  const lo = (-(sh & 0xFF)) & 0xFF;                     // $3F25
  if (lo === 0) return { v: 0, skip: true };            // $3F27
  const hi = (~(sh >> 8)) & 0xFF;                       // $3F2A
  return { v: ((hi << 8) | lo) & 0xFFFF, skip: false };
}

/** ROM: loc_01_4053.  Reel the rope back in, one link per frame. */
function retract(state, manifest) {
  const p = state.player;
  const r = state.rope;

  p.action = 3;                                  // $4055
  const d = (r.delay + 1) & 0xFF;
  if (d < 1) {                                   // $405E: only if it wrapped
    r.delay = d;
    drawRope(state, manifest);
    return;
  }
  const n = p.ropeSegments + 1;                  // $4062
  if (n >= 5) {                                  // $4063
    p.action = 0;
    return;                                      // $406B: not even drawn
  }
  p.ropeSegments = n;
  r.delay = 0;
  drawRope(state, manifest);
}

/**
 * ROM: loc_00_3FD6.  Let go, launching along the swing's tangent.
 *
 * Speed scales with 7 - anchorIndex, so a rope that bit early (few segments
 * used, high $FFB4) throws you less far than one at full stretch.
 */
function release(state) {
  const p = state.player;
  const r = state.rope;
  const phase = p.ropeLength;
  const m = 7 - p.ropeSegments;                  // $3FE3

  // $3FEE: seeded then accumulated m more times (so x(m+1), as in scaleDelta),
  // followed by a LOGICAL >> 4 -- the table byte is unsigned here.
  let hx = X_TABLE[phase];
  for (let i = 0; i < m; i++) hx = (hx + X_TABLE[phase]) & 0xFFFF;
  let vx = (hx >> 4) & 0xFF;
  if (r.dx & 0x8000) vx = (-vx) & 0xFF;          // $4002: sign from $C727
  p.vx = i8(vx);                                 // $400E

  // $401B: no upward kick unless the Y table is already negative, i.e. you are
  // past the bottom of the arc and on the way up. Release early and you just
  // get the horizontal throw.
  const yd = Y_TABLE[phase];
  if ((yd & 0x80) === 0) { p.action = 0; return; }

  let hy = (-yd) & 0xFF;
  for (let i = 0; i < m; i++) hy = (hy + ((-yd) & 0xFF)) & 0xFFFF;
  p.vy = i8(((hy >> 4) + 2) & 0xFF);             // $403C: the +2 is flat bonus
  p.air = 1;                                     // $4043: rising
  p.jumpReleased = 0;                            // $4046
  requestSound(state, 0x0F);
  p.action = 0;                                  // $404F
}

/**
 * ROM: loc_01_4072.  Draw the chain and, while it is still travelling, drag it
 * along with the player.
 */
function drawRope(state, manifest) {
  const p = state.player;
  const r = state.rope;
  const cam = cameraPixels(state);
  const travelling = p.action === 1 || p.action === 3;

  // $4156: while swinging on the ground the hand link is dropped, which keeps
  // the rope from visibly detaching from Batman's arm as he stands up.
  const bound = (p.action === 2 || p.action === 4)
    ? (p.air === 0 ? 4 : 5)
    : 5;

  for (let i = p.ropeSegments; ; i++) {
    const slot = r.slots[i];

    if (travelling && !state.flow.paused) {
      // $4091: an 8-bit add of this frame's velocity plus last frame's carry,
      // sign-extended afterwards -- so it wraps at 255 before it is widened.
      slot.x = u16(slot.x + i8((p.vx + r.saveX) & 0xFF));
      slot.y = u16(slot.y + i8((((-p.vy) & 0xFF) + r.saveY) & 0xFF));
    }

    const sx = (slot.x >> 4) - cam.x;            // $40DA: sub_00_1172
    const sy = ((slot.y >> 4) - 0x100) - cam.y;

    // $40F2: the link graphic changes with the swing angle.
    const ph = p.ropeLength;
    const k = ph < 0x0D ? 0 : ph < 0x14 ? 1 : ph < 0x1E ? 2 : ph < 0x25 ? 3 : 4;
    drawMetasprite(state, manifest.metasprites.table1,
                   LINK_IDS[p.facing * 5 + k], sx, sy, 0);

    // $412C: the tip carries the hook head on top of the link.
    if (travelling && i === p.ropeSegments) {
      drawMetasprite(state, manifest.metasprites.table1, HOOK_IDS[p.facing],
                     sx + (p.facing === 0 ? 8 : 0), sy, 0);
    }

    if (i >= bound) break;                       // $4170
  }

  advancePhase(state);
}

/** ROM: loc_01_4176.  Wind the swing on, and turn around at the extreme. */
function advancePhase(state) {
  const p = state.player;
  const r = state.rope;

  if (p.action === 1 || p.action === 3) return;  // $417B/$417E
  if (state.flow.paused) return;                 // $4183

  const ph = (p.ropeLength + 1) & 0xFF;
  if (ph < PHASE_END) { p.ropeLength = ph; return; }   // $418A
  p.action = 4;                                  // $418E -- and phase is NOT stored

  // $419D: the turn costs exactly two frames -- one to notice, one to act. The
  // `XOR A` at $41B0 that clears the phase also lands in $C720 on the way past
  // ($41B4 is the shared tail), so the counter resets to zero rather than to
  // the value just computed. Carrying it forward instead makes every later
  // turn instant and the swing drifts a frame ahead per half-cycle.
  const f = (r.flip + 1) & 0xFF;
  let store = f;
  if (f >= 2) {                                  // $41A1
    p.action = 2;
    p.facing ^= 1;                               // $41AC
    store = 0;                                   // $41B0
    p.ropeLength = 0;                            // $41B1
  }
  r.flip = store;                                // $41B4
}

/** ROM: the CPL/CPL/INC pair -- no carry into the high byte. Doc item 16. */
function neg16q(v) {
  return (((~(v >> 8) & 0xFF) << 8) | ((~v + 1) & 0xFF)) & 0xFFFF;
}

const s16 = (v) => (v << 16) >> 16;

function requestSound(state, id, mask = 0x01) {
  if (state.sound && state.sound.queue.length < 4) {
    state.sound.queue.push({ id, mask });
  }
}
