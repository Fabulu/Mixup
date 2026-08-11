// THE HIGH-SCORE TABLE -- `$287D96`'s insertion search.  W299.
//
// W290 deferred this subsystem when bonus line 2 needed its carry, and W297 and W298 both
// declined to start it for the same stated reason: **the direction of the comparison
// depends on which end of the array holds the highest score, and getting it backwards
// produces a table that is populated, ordered, and silently wrong.**
//
// ============================ THE ORDERING, MEASURED ========================
//
// Settled by reading the SHIPPED SEED, which is a snapshot of the board's own main RAM:
//
//   $803824  01182223      <- index 0, the HIGHEST
//   $803828  00846001
//   $80382C  00816579
//   $803830  00775305
//   $803834  00699653      <- index 4, the LOWEST
//
// Five BCD scores in DESCENDING order -- 1,182,223 down to 699,653. So `$803824` is the
// base, `$803838` is one past the end, and `lea $803838,A1 / move.l -(A1),D1` walks
// **from the LOWEST entry upward**. The parallel word array at `$8038B0..$8038B9` is the
// per-entry score OVERFLOW and is all zero in the seed, which is consistent with every
// score being under 100,000,000.
//
// ============================ AND `dbcc` GOES THE OTHER WAY ==================
//
// `DBcc` is "decrement and branch if the condition is FALSE". So `dbcc` -- carry clear --
// **exits the loop when the carry is CLEAR** and loops when it is SET. Reading it as
// "loop while carry clear" makes the whole search run backwards, and it is the single
// easiest thing to get wrong here:
//
//   287dac  cmp.w D5,D2          D2 = the entry's overflow, D5 = the new one
//   287dae  bhi $287DB8          entry > new  -> EXIT: the entry beats us, stop here
//   287db0  bcs $287DB4          entry < new  -> carry SET -> dbcc LOOPS: keep going up
//   287db2  cmp.l D7,D1          equal overflows: compare the score longs
//   287db4  dbcc D0,$287DA8      D1 < D7 -> carry set -> LOOP.  D1 >= D7 -> EXIT
//
// Which is exactly an insertion search on a descending array walked from the bottom:
// **keep climbing while the entry is beaten, and stop at the first entry that beats the
// new score.** Both readings look plausible from the instructions alone; only one agrees
// with the seed's ordering, and that is why the ordering had to come first.
//
// ============================ THE CARRY IS THE "NO ROOM" SIGNAL =============
//
//   287db8  addq.w #1,D0
//   287dba  move.w D0,D2
//   287dbc  add.w D0,D0 (x3)     D0 = index * 8
//   287dc2  moveq #$4,D1 / sub.w D2,D1
//   287dc6  rts
//
// There is no `ori #$1,SR` anywhere -- **the carry the caller tests is the borrow out of
// `sub.w D2,D1`.** If the walk stopped at the very first (lowest) entry, D0 is still 4,
// the `addq` makes it 5, and `4 - 5` borrows: `$287CF6 bcs $287D90` then bails, because a
// score that cannot beat the lowest of five does not make the table.
//
// And if the new score beats everything, the `dbcc` decrements D0 to -1 and falls out, so
// `addq` gives 0 -- index 0, the top. The two ends fall out of the same arithmetic.

import { i16, u16 } from './ram.js';

export const HISCORE = Object.freeze({
  // `lea $803838,A1` and `lea $8038BA,A3` are the ENDS; `-(A1)` is what makes them so.
  scoresEnd: 0x803838,
  overflowEnd: 0x8038ba,
  entries: 5,                      // $287DA6 moveq #$4,D0 with dbcc
  get scoresBase() { return this.scoresEnd - this.entries * 4; },      // $803824
  get overflowBase() { return this.overflowEnd - this.entries * 2; },  // $8038B0
  // $287D10 lea $803874,A1 -- the THIRD parallel array `$287CEE` also shifts.
  thirdEnd: 0x803874,
});

/**
 * `$287D96` -- where does `(overflow, score)` belong in the table?
 *
 * @param overflow D5, the new score's overflow word
 * @param score    D7, the new score's longword (BCD)
 * @returns {{index:number, offset:number, count:number, noRoom:boolean}}
 *   `index` is D2 (0 = the top, 5 = past the end), `offset` is D0 (`index * 8`), `count`
 *   is D1 (`4 - index`, the number of entries that must shift down), and `noRoom` is the
 *   BORROW out of `sub.w D2,D1` -- the carry `$287CF6 bcs` reads.
 */
export function hiscoreSearch287D96(ram, overflow, score) {
  const d5 = u16(overflow);
  const d7 = score >>> 0;
  let d0 = HISCORE.entries - 1;                       // $287DA6 moveq #$4,D0
  let a1 = HISCORE.scoresEnd;
  let a3 = HISCORE.overflowEnd;

  for (;;) {
    a1 -= 4;                                          // $287DA8 move.l -(A1),D1
    a3 -= 2;                                          // $287DAA move.w -(A3),D2
    const d1 = ram.u32(a1);
    const d2 = ram.u16(a3);

    if (d2 > d5) break;                               // $287DAE bhi -- the entry beats us
    // $287DB0 bcs: d2 < d5 leaves carry SET, so the dbcc loops.
    const carry = d2 < d5 ? true : (d1 < d7);         // $287DB2 cmp.l D7,D1
    // $287DB4 dbcc -- exits when the carry is CLEAR, loops when it is SET.
    if (!carry) break;
    d0 = i16(u16(d0 - 1));
    if (d0 === -1) break;                             // dbra ran out
  }

  const index = u16(d0 + 1);                          // $287DB8 addq.w #1,D0
  const count = i16(u16((HISCORE.entries - 1) - index));  // $287DC2 moveq #$4 / sub.w
  return {
    index,
    offset: u16(index * 8),                           // $287DBC three add.w D0,D0
    count,
    // the BORROW out of `sub.w D2,D1`, which is the only carry this routine produces
    noRoom: count < 0,
  };
}
