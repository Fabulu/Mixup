# W299: the high-score search, and the ordering that unblocked it

Status: DONE. Suite 2051/2051 (2043 + 8), sweep 0 missing on both, run before the commit.

Three waves declined to start this subsystem. W290 deferred it when bonus line 2 needed its
carry; W297 and W298 both named it next and went elsewhere, each recording the same reason:
**the direction of the comparison depends on which end of the array holds the highest score,
and getting it backwards produces a table that is populated, ordered, and silently wrong.**

That reason was right, and it was also answerable in one measurement.

## Starting state

W298 committed and pushed at `e8e8a17`, suite 2043/2043.

## THE ORDERING, READ OUT OF THE SHIPPED SEED

`rip/web/seed.bin` is a snapshot of the board's own main RAM, so the table in it is the
cartridge's:

    $803824  01182223      <- index 0, the HIGHEST
    $803828  00846001
    $80382C  00816579
    $803830  00775305
    $803834  00699653      <- index 4, the LOWEST

Five BCD scores, **DESCENDING** -- 1,182,223 down to 699,653. So `$803824` is the base,
`$803838` (the address the ROM `lea`s) is one past the END, and `move.l -(A1),D1` walks from
the LOWEST entry upward. The parallel word array at `$8038B0` is the per-entry overflow and is
all zero, consistent with every score being under 100,000,000.

**Nothing about that needed a board capture or a new tool.** Three waves treated it as an open
question when the answer was sitting in a file the repo already ships, which is worth
recording as its own lesson: *before deciding a question needs new evidence, check whether the
existing evidence already answers it.*

## AND I HAD `dbcc` BACKWARDS

`DBcc` is "decrement and branch if the condition is FALSE". So `dbcc` -- carry clear --
**exits when the carry is CLEAR** and loops when it is SET. My first reading of this search
was the opposite, and with that reading the code makes no sense at all: both `bhi` and `bcs`
appear to exit and only the equal case can loop.

Read correctly:

    287dac  cmp.w D5,D2          D2 = the entry's overflow, D5 = the new one
    287dae  bhi $287DB8          entry > new  -> EXIT: this entry beats us, stop here
    287db0  bcs $287DB4          entry < new  -> carry SET -> the dbcc LOOPS: climb
    287db2  cmp.l D7,D1          equal overflows: compare the score longs
    287db4  dbcc D0,$287DA8      D1 < D7 -> carry set -> LOOP.  D1 >= D7 -> EXIT

Which is exactly an insertion search on a descending array walked from the bottom: **climb
while the entry is beaten, stop at the first entry that beats the new score.** Both readings
look plausible from the instructions alone; only one agrees with the seed's ordering. That is
why the ordering had to come first, and it is why the two facts belong in one wave.

## THE CARRY IS THE BORROW, NOT AN EXPLICIT SET

There is no `ori #$1,SR` anywhere in `$287D96`. The carry that `$287CF6 bcs $287D90` reads is
the **borrow out of `sub.w D2,D1`**: if the walk stopped at the lowest entry, D0 is still 4,
`addq.w #1,D0` makes it 5, and `4 - 5` borrows. A score that cannot beat the lowest of five
does not make the table, and that is how the caller finds out.

The other end falls out of the same arithmetic: if the new score beats everything, the `dbcc`
decrements D0 to -1 and drops out, so `addq` gives 0 -- index 0, the top.

## VERIFIED AGAINST THE BOARD'S OWN SCORES

Every case is a prediction about the cartridge's table rather than about the port agreeing
with itself:

    2,000,000   -> index 0, count 4      beats everything
      900,000   -> index 1               between 1,182,223 and 846,001
      850,000*  -> index 2               between   846,001 and 816,579
      800,000   -> index 3               between   816,579 and 775,305
      700,000   -> index 4               between   775,305 and 699,653
      500,000   -> index 5, NO ROOM      beats none
      699,653   -> index 5, NO ROOM      an exact TIE does not displace

The tie is the one worth calling out: `dbcc` exits on `D1 >= D7`, so an equal score stops the
walk and the incumbent keeps its place. Tying the LAST entry therefore does not make the table
at all, and tying a middle entry lands below it.

And the key is lexicographic -- `cmp.w` runs first and both its branches leave before the long
is looked at -- so an overflow of 1 with a score of 1 beats the board's biggest entry.

## Order for the next wave

1. **`$287CEE`, the INSERT.** Now unblocked: it `bsr`s this search, bails on the borrow, then
   shifts `count` entries down with `move.l (-$8,A2),-(A2)` and `move.w (-$4,A5),-(A5)` and
   writes D7/D5 at the gap -- and repeats the shift for a THIRD parallel array at `$803874`.
   The test to write is the one W297 asked for: insert a known sequence and assert the WHOLE
   table order, not one entry.
2. Then `$287C3E` and its two heads `$287BD2`/`$287C08`, which is what bonus line 2 defers.
3. **`$280252`** still blocked on measuring A0 at `$28029A` (W288) -- a register feeding
   arithmetic, per W294's rule, so that one really does need the capture.
4. `$280BCE`'s last five, then stage 5 and the loops.
