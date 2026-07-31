// Enemy array -- $C268.  THE BARREL.
//
// 8 slots x 32 bytes, preloaded whole at level init from a bank-5 blob that is
// a byte-identical image of the RAM records. There is no streaming spawner and
// no pooling: the whole roster for a level exists from the moment it loads,
// dormant until the camera comes near. The entire game ships 26 non-boss
// enemies and 5 boss entities. The only runtime spawn is the projectile copy
// into slots 6/7 (sub_01_6BDC).
//
// This file used to be 3018 lines. Phases 7-9 of the restructure took all of
// it out, verbatim, and what is left is the export surface -- the SAME NINE
// NAMES it had before the split, so that not one of the four consumers
// (level.js, main.js, player.js, state.js), the unit tests, or
// tools/oracle/punchreach.mjs needed a single edit.
//
// WHERE EVERYTHING WENT. Each line is the ROM range that module owns; the
// module headers carry the detail.
//
//   enemies/record.js   the 8x32 record layout, SLOTS/RECORD, the flag bits
//                       and the 24 named byte offsets (Phase 8)
//   enemies/util.js     sub_01_63AD adds, the negate/absdiff idioms,
//                       $FF93/$FF94, the sub_00_0AE1 sound mailbox
//   enemies/probe.js    sub_01_6666 and its five mode wrappers ($63B4/$6499/
//                       $64FA/$656A/$6616) -- and $FFBE, which stays on state
//   enemies/anim.js     $5DFF-$6063 the animation machine, loc_01_5FE6 the
//                       walk cycle, the draw queue and its flush
//   enemies/tails.js    loc_01_5BB6 / loc_01_5C15 / loc_01_5CA8, the shared
//                       rise -> fall -> land -> screen/anim fall-through
//   enemies/melee.js    loc_00_2643-$272B, the player's punch scan
//   enemies/intro14.js  loc_01_77BD, the level-14 entrance -- which REPLACES
//                       the slot loop rather than running inside it
//
// ONE FILE PER STATE AND ONE PER BOSS, each carrying its st* handler AND its
// attackTick* together, because most of those pairs FALL THROUGH into each
// other in the ROM ($637C, $6209, $62FB, $63A3, $6392, and the flyer's tick
// into the handler's own move arms). game.json's enemies[] entries name these
// files, one per driver state, which is the point of splitting this way.
//
//   enemies/states/dormant.js       state 12  jt_01_5B95 + jt_01_637F
//   enemies/states/chaser14.js      state 4   jt_01_7750
//   enemies/states/vehicle6.js      state 5   jt_01_575C + jt_01_6398
//   enemies/states/flyer.js         state 3   jt_01_55AA + jt_01_6169
//   enemies/states/projectile.js    state 11  jt_01_59E0 + sub_01_6BDC
//   enemies/states/shooter12.js     state 6   jt_01_57D6 + jt_01_61B3
//   enemies/states/walkershared.js  the step, the two wall stops, the ledge
//                                   scan and sub_01_7D09's scripted pit leaps
//   enemies/states/walker.js        states 1 and 2  jt_01_50ED, jt_01_5399,
//                                   jt_01_612E
//   enemies/bosses/boss1.js         state 10  jt_01_7591 + jt_01_634F, and
//                                   sub_01_79DB, which bosses 2 and 4 borrow
//   enemies/bosses/boss2.js         states 7 and 13  jt_01_6D8A, jt_01_61DD,
//                                   jt_01_78A7
//   enemies/bosses/boss3.js         state 8   jt_01_7061 + jt_01_621F
//   enemies/bosses/boss4.js         state 9   jt_01_7288 + jt_01_6300
//
// AND THE ORDER LIVES IN EXACTLY ONE PLACE:
//
//   enemies/driver.js   sub_01_4E0C -- the slot loop and its $FFA7 direction,
//                       the ten-arm ladder $4E27..$4F1E, both dispatch tables,
//                       the stun countdown and the two knockbacks, and the
//                       kill path. Nothing else in the port knows what runs
//                       before what. Read its header before touching it.
//
// A state module never imports this file, and never imports the driver. The
// arrows run barrel -> driver -> states -> {tails, probe, anim, util, record},
// with two deliberate sideways edges that are BORROWING and are commented as
// such: bosses 2 and 4 call boss 1's sub_01_79DB, and five callers reach the
// projectile's own sub_01_6BDC.

export { SLOTS, RECORD } from './enemies/record.js';
export { meleeHitTest } from './enemies/melee.js';
export { drawEnemies } from './enemies/anim.js';
export {
  UNIMPLEMENTED_STATES, createEnemies, loadEnemies, updateEnemies,
} from './enemies/driver.js';

import {
  probeCore, probeRight, probeLeft, probeUp, probeDown, attackProbe, wallAhead,
} from './enemies/probe.js';
import { neg16q, absDiff8 } from './enemies/util.js';
import { riseTail, fallTail, screenTail } from './enemies/tails.js';
import { gapLeap, ledgeCheck } from './enemies/states/walkershared.js';
import { spawnProjectile } from './enemies/states/projectile.js';
import { stunnedTick, primaryDispatch } from './enemies/driver.js';

// Exposed for the unit tests only.
export const _internals = {
  probeCore, probeRight, probeLeft, probeUp, probeDown, attackProbe,
  wallAhead, gapLeap, ledgeCheck, spawnProjectile, riseTail, fallTail,
  screenTail, neg16q, absDiff8, stunnedTick, primaryDispatch,
};
