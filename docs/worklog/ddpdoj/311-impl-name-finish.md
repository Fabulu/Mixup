# W311: the finish button, the commit tail, and why the count can never reach three

Status: DONE. Suite 2258/2258 (2243 + 15 new, minus one W309 test merged into another), no skips.
Sweep 0 missing on both.

## Starting state

W310 committed and pushed at `e3270ae`, suite 2243/2243.

## `$28F606` DOES WORK: IT COMMITS THE CHARACTER UNDER THE CURSOR

W309 left it as "where a non-empty finish goes", which made it sound like glue.

    28f606  move.w ($18,A4),D0 / add.w D0,D0 x2      the cell the cursor is on RIGHT NOW
    28f61a  cmpi.w #$1B,($18,A4) / bcs $28F628
    28f622  moveq #$0,D0 / bra $28F59E               on END -> DDP
    28f628  move.l D0,(A0,D1.w)                      otherwise WRITE it
    28f62c  addq.w #1,($16,A4)
    28f630  cmpi.w #$3,($16,A4) / bne $28F5E8        short -> pad with END glyphs
    28f638  bra $28F674                              three -> the filter

So finish **adds the character you are pointing at**. `SE` with the cursor on `X` finishes as
`SEX`; `S` with the cursor on `E` finishes as `S E <28>`. A port treating finish as a pure commit
would drop the last character the player chose -- a bug that reads as an input-timing problem.

**And the END test comes before the count test**, so finishing with the cursor on END discards
whatever was typed, however much of it there is. My first draft of that test expected the filter
to run on a three-character name; it does not. `$28F59E` therefore has THREE callers -- nothing
typed, a banned name, and finishing on END -- and they are the three ways to decline to enter a
name. All three are resolved out of the image rather than asserted from the reading.

## THE COMMIT TAIL ARMS THE COUNTDOWN, WHICH IS THE ANSWER TO A QUESTION W309 LEFT OPEN

    28f6a8  bsr $28F7C8                write the name into the table   (W304)
    28f6ac  move.w ($12,A4),D1 / bclr D1,$81E0D9    release the setup bit   (W308)
    28f6b6  move.w #$70,($1E,A4)       ARM THE COUNTDOWN at 112 frames
    28f6bc  moveq #$0,D0 / move.l D0,($1A,A4)
    28f6c2  bra $28F7F4                and draw the panel

`$28F6B6` is the missing link, and I found it by scanning for writes to `($1E,A4)` rather than
assuming. W308 showed `$28F4FC tst.w ($1E,A4)` sends every later frame down the countdown path, so
**once a name is committed the input at `$28F542` is unreachable.** That is what makes the
count-of-three cases in `$28F606` and `$28F652` genuinely impossible rather than merely
unobserved, and both `unreached`s in this port now say so.

It also explains W308's `$30` one-shot: the countdown starts at `$70` and the arm fires 64 frames
in, a little over a second before the screen ends.

## A CORRECTION TO W309: THE END ARM DOES NOT STOP AT THE PADDING

W309 ported `$28F5E8`'s padding loop and returned. The loop leaves through `$28F602 bra $28F674`,
so **selecting END runs the filter and the commit tail in the same frame.** W309's port left the
machine in a state the board is never in: three characters entered, the countdown unarmed, and the
input arms still live -- which is exactly the state my new `unreached` fires on. The throw found
the omission, which is the argument for throwing rather than guessing.

Two W309 tests observed the intermediate padded name and had to change. The all-END name now never
survives a frame: it is created and replaced by the filter before the arm returns. The tests were
rewritten to assert the DATA fact (`$70 $70 $70` is what padding three empty slots makes, and it is
banned entry 16) separately from the BEHAVIOUR fact (selecting END gives `DDP`), plus a case where
the padded name is NOT banned -- `D <28> <28>` -- so a port that simply always wrote `DDP` would
fail.

## ONE OBSERVATION, OFFERED AS AN OBSERVATION

A0 at `$28F6A8` is `($30,A4)`, and I scanned it: one writer (`$28F75A`, the lookup's matched row)
and six readers, all in this screen. The input arms write into that same row and the first
character lands at offset 0, on top of the tag. So by the time the commit runs, the row `$28F7C8`
searches for usually no longer carries a tag and its search falls through to the silent no-op W304
ported faithfully.

That is what the instructions say. It is **not** a claim that the call is dead -- a path reaching
the commit with the row still tagged would make it act -- and the port reproduces the ROM either
way rather than shortcutting to "this does nothing".

## Changes

* `src/hiscorename.js`: `nameFinish28F606`, `nameCommitTail28F6A8`, `nameCommit`, the shared
  `padWithEnd` and `writeDefault` (three ROM callers between them), `FINISH`, `TIMEOUT.armed`, and
  the END-arm correction. `nameButtons28F588` gains a `rom` parameter because its END arm now
  reaches the filter.
* `tests/w311namefinish.test.js`, 15 assertions; two W309 tests rewritten.

No new ROM window.

**The name entry is complete.** Every path from a tagged row to a committed name is ported:
lookup, cache, cursor, input, finish, filter, write, setup-bit release, countdown, and both
endings.

## Order for the next wave

1. `$28F7F4..$28F8AA` and `$28FAF4`, the last presentation in this screen -- emitter chains of
   immediates, the shape W303 and W307 have done twice. The first ends exactly where W306's
   banned-name table begins. Counted four times now.
2. **`$280252`** still blocked on measuring A0 at `$28029A` (W288) -- a register feeding
   arithmetic, per W294's rule, so it needs the capture.
3. `$280BCE`'s last five: 2 (`$280CF8`), 3 (`$280D10`), 17 (`$280DBA`), and 1 and 16 which
   belong to `allocBee27F92A`.
4. D11's remainder -- the anim tier, reached from four directions.
5. Stage 5 and both loops.
