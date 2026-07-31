// Batman's pose selection.  ROM: bank 0, loc_00_1B4A ($1B5D-$1D0B), plus its
// walk-cycle tail loc_00_1CD6.  Split out of src/player.js in Phase 10.
//
// WHY THIS ONE IS SAFE TO CUT AND THE PHYSICS IS NOT.  $1B4A is a JP TARGET,
// not a fall-through: every arm of the movement chain that reaches here does so
// by jumping ($1441, $1A29/$1A57/$1A9D) or by running off the end of `vertical`,
// and NOTHING falls back out of $1D0B into player code.  The $1438..$1B4A
// region above it is one contiguous fall-through chain and stays in one file for
// exactly the opposite reason -- see src/player.js's own note.
//
// THE ONE EDGE BACK.  This module imports AIR_GROUNDED/AIR_RISING/AIR_FALLING
// from src/player.js, which imports selectAnim from here: a deliberate two-node
// cycle that models the join the ROM has.  $FF80 is written by the physics and
// read by the pose ladder ($1C43, $1C50), so the constants belong to the
// physics and are only borrowed here.  Both directions are referenced inside
// function bodies only, never at module-evaluation time, so there is no TDZ
// hazard in any load order -- proved by importing this module first, in
// isolation, before src/player.js exists in the graph.
//
// AND THE RULE THAT MATTERS: selectAnim only ever READS $FFC4 (animFrame), as a
// "a repaint is still in flight, do not change pose" gate.  Writing it belongs
// to the TILE STREAMER, sub_00_2C13 at $05C9, which runs after the player
// update.  The two routines are a feedback loop and modelling either one alone
// gets both wrong.

import { u8 } from '../state.js';
import { BTN } from '../input.js';
import { AIR_GROUNDED, AIR_RISING, AIR_FALLING } from '../player.js';

/** @typedef {import('../gametypes.js').GameState} GameState */

// ---------------------------------------------------------------------------
// Animation select.  ROM: loc_00_1B4A ($1B5D-$1D0B), a routine-for-routine
// translation.  Every arm below cites the address it came from, and the ONE
// rule that matters here is the project's usual one: follow where a label
// falls THROUGH, not where it is named.
//
// Three exits, and they are not interchangeable:
//   loc_00_1D08  `LDH A,[$FF88] / LDH [$FF8B],A` -- msIndex = facing, then draw
//   loc_00_1D0C  the draw ALONE; msIndex keeps whatever the arm left in it
//   (a `RET` from $1D1B, the invulnerability blink, which skips the draw AND
//    the $1D2C hitbox reload -- that half lives in render/metasprite.js)
//
// What this file must NOT do is touch $FFC4/$FFC5 (animFrame/animPrev): those
// belong to the TILE STREAMER, sub_00_2C13 at $05C9, which runs after the
// player update. selectAnim only ever READS $FFC4, as a "a repaint is still in
// flight, do not change pose" gate ($1C43, $1C50, $1CB3, $1CF6). The two
// routines are a feedback loop and modelling either one alone gets both wrong.
// ---------------------------------------------------------------------------

/**
 * Animation ids. Confirmed against the cartridge frame by frame, not guessed.
 * These are load-bearing: the hitbox is looked up per animation from 0:$27A8,
 * so the airborne poses are 1 px narrower (halfW 14) than the grounded ones
 * (halfW 15) and the crouch/low-throw poses are 4.
 *
 * The walk cycle is SIX frames, not four: $1CFE wraps on `CP $06`.
 */
export const ANIM = {
  WALK_CYCLE: [0x00, 0x01, 0x02, 0x03, 0x04, 0x05],   // $1CFB-$1D03
  WALK_WRAP: 0x06,                         // $1CFE: CP $06
  IDLE: 0x06,                              // $1CC7
  LAND: 0x07,                              // $1CD0, the $FF90 squat
  RISING: 0x08,                            // $1C49
  FALL_START: 0x09,                        // $1C5C, while vy >= $E6 unsigned
  FALL: 0x0A,                              // $1C63
  CROUCH: 0x0D,                            // $1C8E
  CLING_A: 0x11, CLING_B: 0x12,            // $1B9B / $1B9F
  TURN: [0x14, 0x13],                      // the $1BD3 skid pair, in ROM order
  ROPE: [0x1B, 0x1C, 0x1D],                // $1B84 / $1B88 / $1B80
  DEAD: 0x1E,                              // $1B63
};

/**
 * Attack poses. ROM tables at 0:$1C1F (grounded), 0:$1C27 (grounded + Down)
 * and 0:$1C2F (airborne), each indexed by `(attackTimer & $0C) >> 2` and
 * offset by `$C71D * 4` -- so a swing shows four poses over its 16 ticks and
 * the batarang throw is the same table four bytes along.
 *
 * $1C27 is not a separate table: it is 0:$1C1F + 8. Kept split for legibility.
 */

/**
 * Metasprite indices for the attack poses, ROM tables 0:$2786 and 0:$2796,
 * indexed by `facing * 4 + (pose ? 8 : 0) + quarter` ($1C16: `LD A,C /
 * ADD A,B / RST $28`).
 *
 * This is why the old "punch uses entry facing+2" heuristic worked at all:
 * entries 0/1 are the ordinary six-sprite Batman and have nowhere to put an
 * outstretched fist, so the extended frames switch to 2/3 (or 4/5 for the
 * crouching set, which the heuristic had no notion of).
 */

/**
 * ROM: the tail of loc_00_1B4A, from $1B5D (the screen-position cache at
 * $1B4A-$1B5C is cachePlayerScreen in render/metasprite.js).
 * @param {GameState} state
 */
export function selectAnim(state) {
  const p = state.player;

  // $FF91/$FF92 are read-modify-write HRAM bytes used by NOTHING outside this
  // routine (grepped: $1C94/$1C99 and $1C70/$1C7A/$1C8C are their only sites).
  // The ROM does not clear either at level init -- $04DD-$0500 lists $FFC3,
  // $FFC4, $FFC5 and a dozen others but not these -- so carrying them across a
  // level load is the faithful behaviour, not an oversight.
  if (p.prevVx === undefined) p.prevVx = 0;      // $FF91
  if (p.crouching === undefined) p.crouching = 0; // $FF92

  // $1B5D: dying overrides everything.
  if (p.dead) { p.anim = ANIM.DEAD; p.msIndex = p.facing; return; }

  // $1B6A: bat-rope FLIGHT poses. The test is `CP $03 / JR Z` then
  // `CP $02 / JR C` -- so action 3 and actions 0/1 fall to the cling check and
  // only action 2 (and any value above 3) reaches the $C71F phase ladder.
  if (p.action !== 3 && p.action >= 2) {
    const ph = p.ropeLength & 0xFF;              // $C71F
    p.anim = ph < 0x14 ? ANIM.ROPE[0]            // $1B84
           : ph < 0x1E ? ANIM.ROPE[1]            // $1B88
           : ANIM.ROPE[2];                       // $1B80
    p.msIndex = p.facing;                        // $1D08
    return;
  }

  // $1B8F: the wall cling. The switch point is $06, read straight off
  // `CP $06 / JR C` -- not empirical, and not 5.
  const cling = p.clingLock & 0x1F;
  if (cling !== 0) {
    p.anim = cling >= 0x06 ? ANIM.CLING_A : ANIM.CLING_B;
    p.msIndex = p.facing ^ 1;                    // $1BA3: XOR $01 -- this arm
    return;                                      // $1BA9: JP $1D0C, skipping $1D08
  }

  // $1BAC: the turn-around skid. The countdown is decremented HERE, in the
  // draw path, not by the movement code that arms it.
  if (p.turnTimer !== 0) {
    p.turnTimer = (p.turnTimer - 1) & 0xFF;
    // $1BB7: `AND $08 / ADD A,A / SWAP A` turns bit 3 into a 0/1 table index.
    // Bit 3 SET selects $1BD3+1 = $13. The old port had this inverted.
    p.anim = ANIM.TURN[(p.turnTimer & 0x08) ? 1 : 0];
    p.animTimer = 5;                             // $1BC6: $FF89 = 5
    p.msIndex = p.facing ^ 1;                    // $1BCA
    return;                                      // $1BD0: JP $1D0C
  }

  // $1BD5: an attack in progress owns the pose. `quarter` is the swing's
  // 16-tick counter divided into four, and the AIR test wins over Down.
  if (p.attackTimer !== 0) {
    const quarter = (p.attackTimer & 0x0C) >> 2;       // $1BE2
    const crouch = p.air === AIR_GROUNDED && (state.input.held & BTN.DOWN) !== 0;
    const set = p.air !== AIR_GROUNDED ? 'air' : (crouch ? 'crouch' : 'ground');
    const pose = p.attackPose & 0xFF;                  // $C71D
    // $1C04: a nonzero pose steps the anim table by 4 and the msIndex table
    // by 8 -- two different strides for the same selector.
    // Both tables are ONE contiguous block in the ROM: 0:$1C1F is 24 bytes
    // (ground, crouch, air) and 0:$2786 is 32 (ground, crouch), so the "set"
    // is just an offset. They throw when absent -- animation id 0 and
    // metasprite index 0 are both valid, so a default draws the wrong Batman
    // rather than failing.
    const anims = state.tables?.attackAnim;
    const msIdx = state.tables?.attackMsIndex;
    if (!anims || !msIdx) {
      throw new Error('player: tables.attackAnim/attackMsIndex missing');
    }
    const animBase = set === 'air' ? 16 : (set === 'crouch' ? 8 : 0);
    p.anim = anims[animBase + ((pose * 4 + quarter) & 0x07)];
    p.msIndex = msIdx[(crouch ? 16 : 0)
      + ((p.facing * 4 + (pose !== 0 ? 8 : 0) + quarter) & 0x0F)];
    return;                                            // $1C1C: JP $1D0C
  }

  // --- loc_00_1C37: no attack. Dispatch on $FF80. ---------------------------
  if (p.air === AIR_RISING) {                    // $1C43
    // $1C45: a repaint still in flight pins the pose. This gate is why the
    // old tick-counter version could never line up: the cadence is owned by
    // the tile streamer, not by a countdown in the state machine.
    if (p.animFrame === 0) p.anim = ANIM.RISING;
    p.msIndex = p.facing;                        // $1D08
    return;
  }

  if (p.air === AIR_FALLING) {                   // $1C50
    if (p.animFrame === 0) {
      // $1C58: `CP $E6 / JR C`. Falling velocities have wrapped into the high
      // byte range, so "unsigned >= $E6" is "not yet faster than -26" -- the
      // fall-entry pose is a SPEED band, never a frame count.
      p.anim = u8(p.vy) >= 0xE6 ? ANIM.FALL_START : ANIM.FALL;
    }
    p.msIndex = p.facing;
    return;
  }

  // --- loc_00_1C6A: grounded ------------------------------------------------
  if (state.input.held & BTN.DOWN) {             // $1C6C: BIT 7
    // $1C7E. Both of these leave $FF92 alone, so releasing Down out of an
    // armed spring or a $C750 freeze does NOT stamp the stand-up squat below.
    if (p.springArmed) {                         // $1C82 -> $1CC3
      p.anim = ANIM.CLING_A; p.msIndex = p.facing; return;
    }
    if (state.flow.bossMode) {                   // $1C88 -> $1CC7 ($C750)
      p.anim = ANIM.IDLE; p.msIndex = p.facing; return;
    }
    p.crouching = 1;                             // $1C8C: $FF92 = 1
    p.anim = ANIM.CROUCH;                        // $1C8E
    p.msIndex = p.facing;
    return;
  }

  // $1C70: Down was held last frame and is not now -> stand back up through
  // the same 8-frame squat a landing uses.
  if (p.crouching !== 0) {
    p.squatTimer = 0x08;                         // $1C75: $FF90 = 8
    p.crouching = 0;                             // $1C79
  }

  // $1C94: $FF91 is last frame's velocity, and it is stored unconditionally
  // BEFORE the branch -- so it tracks the walk arm as well as the idle one.
  const prevVx = p.prevVx & 0xFF;
  p.prevVx = u8(p.vx);
  if (u8(p.vx) !== 0) { walkAnim(state); return; }   // $1C9C -> $1CD6

  // Standing still. $1C9F-$1CAE: arriving at zero from a nonzero velocity,
  // on the ground, with no spring armed, stamps the squat -- this is the
  // little dip Batman does when he stops walking.
  if (prevVx !== 0 && p.air === AIR_GROUNDED && !p.springArmed) {
    p.squatTimer = 0x08;                         // $1CAC
  }

  p.animTimer = 0;                               // $1CB0: $FF89 = 0
  // $1CB6: `JR NZ, loc_00_1D0C` -- note the target. A repaint in flight leaves
  // BOTH the pose and $FF8B alone; it does not fall through to $1D08, so
  // msIndex keeps its previous value across these frames.
  if (p.animFrame !== 0) return;

  if (p.squatTimer !== 0) {                      // $1CB8 -> $1CCD
    p.squatTimer = (p.squatTimer - 1) & 0xFF;
    p.anim = ANIM.LAND;
    p.msIndex = p.facing;
    return;
  }
  // $1CBD: an armed spring holds the cling pose while standing.
  p.anim = p.springArmed ? ANIM.CLING_A : ANIM.IDLE;
  p.msIndex = p.facing;
}

/**
 * ROM: loc_00_1CD6 - the walk cycle.
 *
 * The frame time is a SPEED band, not a constant: 13 frames per step below
 * |vx| 9, 7 below $20, 5 above. Note the band is re-read every frame, so
 * accelerating out of a walk shortens the step already in progress rather
 * than only the next one.
 */
function walkAnim(state) {
  const p = state.player;

  const v = u8(p.vx);
  const speed = (v & 0x80) ? u8(-v) : v;         // $1CD8: CPL / INC A
  const band = speed < 0x09 ? 0x0D                // $1CEA
             : speed < 0x20 ? 0x07                // $1CEE
             : 0x05;                              // $1CE6

  const t = u8(p.animTimer + 1);                 // $1CF2
  if (t < band) {                                // $1CF3: CP B / JR C
    p.animTimer = t;                             // $1D06
  } else {
    // $1CF6: the streamer still owes this pose two columns, so hold the frame
    // and reset the timer instead of advancing.
    if (p.animFrame === 0) {
      const next = u8(p.anim + 1);               // $1CFD
      p.anim = next < ANIM.WALK_WRAP ? next : 0; // $1CFE: CP $06 / XOR A
    }
    p.animTimer = 0;                             // $1D05 / $1D06
  }
  p.msIndex = p.facing;                          // falls through to $1D08
}