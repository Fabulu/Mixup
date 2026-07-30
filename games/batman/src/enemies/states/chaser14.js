// State 4 -- the level-14 chaser (the Joker's grab-balloon).
//
// ROM range: jt_01_7750 only. This is the one handler in the port with no
// attackTick of its own: hitDispatch routes state 4 into jt_01_6107, the
// BASIC tick shared with states 1 and $0B, so that tick stays in the driver
// beside the dispatch table rather than being pulled into any one state's
// file. Nothing here falls through to anything.
//
// It is also the only state that writes the PLAYER's fields ($FF95 slow mode,
// $FF80 air, $FF87 vy) and another SLOT's flags ($C269, slot 0 = the Joker).
// Those are not incidental -- they are how the grab works -- so they stay
// spelled out at the point of write, with their addresses.

import { u8 } from '../../state.js';
import { E_FACING, E_SCREEN_X } from '../record.js';
import { addX, playerScreenX, playerScreenY } from '../util.js';
import { screenTail } from '../tails.js';

// ---------------------------------------------------------------------------
// State 4 -- the level-14 chaser.  ROM: jt_01_7750.
//
// The Joker's grab-balloon: no physics, no probes -- it just slides 4 units
// per frame toward the player's cached screen X. Within $10 px it latches
// slot 0's r[1] bit 7 (sending the Joker into his walk-away taunt) and takes
// the PLAYER over: slow mode on, and -- once he is low on the screen --
// $FF87 = 8 with the rising state, hoisting him upward. Outside the window
// it releases everything.
// ---------------------------------------------------------------------------

export function stChaser(state, r) {
  const psx = playerScreenX(state);                 // $775B vs cached +7
  const diff = u8(psx - r[E_SCREEN_X]);
  const playerLeft = psx < r[E_SCREEN_X];
  const ad = playerLeft ? u8(-diff) : diff;
  if (ad >= 0x10) {                                 // $7764
    r[E_FACING] = playerLeft ? 1 : 0;               // $776C-$7777
    addX(r, playerLeft ? -4 : 4);                   // $777C
    state.player.slowMode = 0;                      // $777F-$7780: $FF95
    state.enemies[0][1] &= 0x7F;                    // $7782-$7787: $C269
    return screenTail(state, r);                    // $778A
  }
  state.enemies[0][1] |= 0x80;                      // $778D-$7792
  state.player.slowMode = 1;                        // $779B / $77AA
  if (playerScreenY(state) < 0x60) {                // $7795: $FF94
    state.player.air = 2;                           // $779F-$77A1: $FF80
    return screenTail(state, r);                    // $77A7
  }
  state.player.vy = 8;                              // $77AE-$77B0: $FF87
  state.player.air = 1;                             // $77B2-$77B4: rising
  return screenTail(state, r);                      // $77BA
}
