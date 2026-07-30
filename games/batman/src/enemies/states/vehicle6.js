// State 5 -- the level-6 vehicle target, and its attack tick.
//
// ROM range: jt_01_575C (the handler) and jt_01_6398 (the tick).
//
// THE PAIR MOVES TOGETHER because $63A3 and $63AA both end in
// `JP jt_01_575C`: whichever arm the tick takes, it FALLS THROUGH into the
// full handler on the same visit. There is no frame on which the tick runs
// alone.

import { u8, u16 } from '../../state.js';
import { spawnDrop } from '../../drops.js';
import {
  E_FLAGS, E_FACING, E_X_HI, E_X_LO, E_Y_HI, E_Y_LO,
} from '../record.js';
import { requestSound } from '../util.js';
import { screenTail } from '../tails.js';

// ---------------------------------------------------------------------------
// State 5 -- the level-6 vehicle target.  ROM: jt_01_575C.
//
// Its X is slaved to $FFCA/$FFCB (flow.parallaxTrack). That used to be the
// blocker on verifying any of this -- the header said the level-6 branch of
// sub_00_2CBE (loc_00_2EF4) was unported and the record rode a frozen track.
// It IS ported (src/conveyor.js level6Track) and state 5 measures bit-exact,
// so the caveat is retired.
//
// Every frame it re-faces the player by WORLD X hi (not screen X), re-pins its
// position from the track, and re-arms the attack. The attack is not just a
// pose: $57C7-$57CB fires a SHOT into the ballistic pool with DE = $0100, i.e.
// kind $01, drift +-8 by facing ($C74D), vy $38 and subtype $01 -- a HAZARD,
// two damage through $15E5, drawn as metasprite $B7. MEASURED
// (tools/oracle/poolwatch.py --level 6): 13 spawns in 400 frames, one hazard on
// screen essentially all the time.
//
// The tail of that note used to read "and the port's pool stayed empty", which
// was true when it was written and has not been since. MEASURED again over the
// same 400 frames: the port fires the same 13 shots and $C6CF is byte-identical
// to the cartridge's for all 612 slot-frames. The shots land about two columns
// from the truck, so the DAMAGE would be unobservable in the shipped level
// either way; the sprite is not, and it is there.
//
// It DOES run screenTail every frame, so the hit scans see fresh +7/+8 bytes.
// ---------------------------------------------------------------------------

export function stL6Vehicle(state, r) {
  r[E_FLAGS] |= 0x20;                               // $575E: SET 5
  r[E_FACING] = (state.player.x >> 8) < r[E_X_HI] ? 1 : 0;   // $5764-$5774 ($FF81 vs +$0E)
  // $5775: $C74D = the same facing byte -- it is the shot's drift selector.
  const t = state.flow.parallaxTrack;               // $577A: $FFCA/$FFCB
  const x = u16(((u8((t >> 8) + 5) << 8) | (t & 0xFF)) + 0xC0);
  r[E_X_HI] = x >> 8;                               // $578A-$578D
  r[E_X_LO] = x & 0xFF;
  if (r[E_FLAGS] & 0x08) return screenTail(state, r);     // $5794: mid-attack
  if (r[E_FLAGS] & 0x04) return screenTail(state, r);     // $579D: stunned
  requestSound(state, 0x22);                        // $57A6
  r[E_FLAGS] |= 0x08;                               // $57AC
  r[0x14] = 0x1F;                                   // $57B2
  // $57B5-$57CB: +$0E..+$11 -> $C749-$C74C, then sub_00_0CF3 with DE = $0100.
  // The facing byte staged at $5775 is $C74D, which the allocator turns into
  // the drift: 1 -> $F8, 0 -> $08 ($0D25-$0D32).
  spawnDrop(state, (r[E_X_HI] << 8) | r[E_X_LO], (r[E_Y_HI] << 8) | r[E_Y_LO],
            r[E_FACING], 0x01, 0x00);               // $57C7-$57CB
  return screenTail(state, r);                      // $57D3
}

/** ROM: jt_01_6398 - the state-5 attack tick just counts and re-enters. */
export function attackTickL6(state, r) {
  if (r[0x14] !== 0) r[0x14]--;                     // $63A0-$63A2
  else r[E_FLAGS] &= 0xC7;                          // $63A6-$63A9
  return stL6Vehicle(state, r);                     // $63A3 / $63AA
}
