// State 12 -- the dormant shell, and the tick that wakes it.
//
// ROM range: jt_01_5B95 (the handler) and jt_01_637F (its attack tick).
//
// THE TWO ARE ONE UNIT AND THAT IS WHY THEY SHARE A FILE. $6392's tail is
// `JP jt_01_5B95`: on the frame the wake timer expires the tick FALLS THROUGH
// into the handler, so the record runs both halves in one visit. Splitting a
// fall-through pair across modules is the trap this port has been bitten by
// repeatedly, so the pair moves together and the tick is written last, below
// the handler it falls into.

import { E_FLAGS, E_STATE } from '../record.js';
import { screenTail, fallTail } from '../tails.js';

// ---------------------------------------------------------------------------
// State 12 -- dormant shell.  ROM: jt_01_5B95.
// ---------------------------------------------------------------------------

export function stDormant(state, r) {
  if (r[E_FLAGS] & 0x08) return screenTail(state, r);     // $5B97
  if (r[E_FLAGS] & 0x02) return fallTail(state, r);       // $5B9B
  if (r[1] & 0x20) return screenTail(state, r);     // $5BA0
  r[E_STATE] = 0x01;                                // $5BA7: wake as a walker
  return screenTail(state, r);
}

/** ROM: jt_01_637F - state 12 counts its timer down, then wakes. */
export function attackTickDormant(state, r) {
  if (r[0x14] !== 0) { r[0x14]--; return screenTail(state, r); }
  r[E_FLAGS] &= 0xE7;                               // $6392
  return stDormant(state, r);
}
