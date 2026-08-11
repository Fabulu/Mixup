# W307: the name-entry grid's furniture, and a warning I had to withdraw

Status: DONE. Suite 2190/2190 (2176 + 14), no skips. Sweep 0 missing on both.

Three straight-line draw routines, the shape W303 ported for `$25B4D6`. Two things in them are
worth more than a transcription, and one of them is a correction to my own first draft.

## Starting state

W306 committed and pushed at `11854e9`, suite 2176/2176.

## FOUR STUBS, AND THIS TIME THEY REALLY ARE DIFFERENT BUCKETS

W303 assumed `$23DECE` and `$23DFB4` were two draw layers because two stub addresses read that
way, measured it, and found **one** bucket behind both. The same measurement here gives the
opposite answer:

    $23DECE -> bucket 0        $23DF2A -> bucket 2        $23DF58 -> bucket 3

`$28FCAA` alone uses three of them in four calls, and parts 2 and 3 have **identical** `move.l`
/`addi.l` pairs -- same position, same attribute -- differing only in art, D4 and stub. So they
are two layers of one glyph position, which is exactly what a distinct bucket is for.

Taken with W303 the rule is neither "stub address implies layer" nor "stub address implies
nothing": it has to be resolved, every time, which is what `resolveEmitStub` exists for. What
W303 got right was the instinct to measure; the answer it found does not generalise.

## THE CARRY IS HARMLESS BY CONSTRUCTION, AND MY WARNING WAS FOR A BUG THAT CANNOT HAPPEN

Every position is `move.l #base,D1 / addi.l #delta,D1` with a negative delta. `addi.l` is a
longword add, so the low half carries into the high half -- and measured, in **all eight** parts
across the three routines, it does, by exactly bit 16 every time.

My first draft of the source comment said a port adding the halves independently "would be one
unit out in Y". The test said otherwise: `$23DECE` and its siblings pack `D1 >> 6` and mask, and
that mask drops the bit for all eight. Feeding the emitter the longword result and the per-axis
result produces **byte-identical records**.

So the two-instruction pair is a signed **per-axis** encoding that happens to be spelled as one
32-bit add, and the carry is discarded downstream rather than meaning anything. The port still
does the longword add because that is what the ROM does, not because it is observable. The
comment now says that, and the test asserts the indistinguishability for all eight pairs rather
than warning against a mistake nothing can make.

Worth keeping as a habit: **a warning in a comment is a claim, and it deserves the same test as
a finding.** This one would have sent a future reader looking for a Y offset that does not exist.

## THE SOLE-SIDE ARMS ARE ONE MIRRORED PAIR

`$28FD2C` (only P2 owes) and `$28FD6E` (only P1 owes) are twins: the same two art longs, the same
two D3s, and they differ in the X halves of D1 and in D4, where `$43` is `$03 | $40`. One bit --
so it is a mirror, not two layouts. Both end in a tail `jmp` into `$23DF58` rather than a
`jsr`+`rts`, which also means a boundary scan for `4E75` finds neither of them and there is a
`nop` padding the gap between them.

They are called only when **exactly one** side owes a name: `$28F4D4 cmpi.b #$3,D0 / beq $28F4F4`
leaves before either `btst`. So this is the furniture that fills the half nobody is using, which
is why there is nothing to draw when both halves are busy. Reading the dispatch as a two-way
choice would draw one side's furniture over a half in use.

## AND THE ANIM TIER, REACHED FOR THE THIRD TIME

`$28F4A6` sets the cursor and `$81E0D6`, then `jsr $246410` with `$28FA98`. That is the
anim-object driver `stageend.js` declares out of scope as `PRESENTATION_DEVIATION[0x28d6fc]`, and
W303 counted `$246710`'s per-node content seeding for the same reason. Third direction onto the
same subsystem in one session, so the note says so -- and it also says what IS drawn, because the
cursor and the furniture around it are not part of that tier.

## Changes

* `src/hiscorename.js`: `drawGrid28FCAA`, `drawSoleSide`, `drawGridFrame28F4C4`,
  `nameArmGrid28F4A6`, `GRID_ROW`.
* `tests/w307namegrid.test.js`, 14 assertions.

No new ROM window: every constant here is in the instruction stream.

**The high-score subsystem is now complete except for the declared anim tier.** Search, insert,
entry, factory table, the display screen's eleven `bsr`s and its state routine, the tag lookup
and writer, the name-entry arms, the work list, the banned-name filter, and the grid.

## Order for the next wave

1. **`$28F4F4` onward and `$28F664`'s per-character commit** -- `add.w D1,D1 /
   move.l D0,(A0,D1.w)` with `($16,A4)` the count W306's filter gates on. That is the input
   handling proper, and `readInput23D186` at `$28F408` already feeds `($36,A4)`. It is the last
   non-presentation piece of the screen.
2. **`$280252`** still blocked on measuring A0 at `$28029A` (W288) -- a register feeding
   arithmetic, per W294's rule, so it needs the capture.
3. `$280BCE`'s last five: 2 (`$280CF8`), 3 (`$280D10`), 17 (`$280DBA`), and 1 and 16 which
   belong to `allocBee27F92A`.
4. The four other announcement-poster caller regions, then D11's remainder -- now reached from
   three directions and probably worth doing properly rather than counting a fourth time.
5. Stage 5 and both loops.
