# W317: type $59, and record count turns out to be the wrong order

Status: DONE. Suite 2315/2315 (2305 + 10), no skips. Sweep 0 missing on both.
`dojcoverage.py` reports **79/256 enemy types ported, 47 unknown**, both OK lines.

Stage 5's work list goes from fourteen types to thirteen, and the ORDER of the thirteen changes.

## Starting state

W316 committed and pushed at `e6b570d`, suite 2304/2304.

## THE REORDERING, WHICH IS THE MAIN RESULT

W314 ranked the remaining types by how many script records each covers, and W316 followed that and
took `$45` (21 records). Doing the same for `$46` (13 records) turned up a dependency: its state 2
does `moveq #$55,D0 / jsr $263684`, and **type `$55` is unported and 1130 bytes** -- so `$46` really
costs about 1550 bytes, not 418.

So I scanned every remaining handler for the three deferred-spawn entry points
(`$263678`/`$263684`/`$263690`) and read the `moveq #TYPE` before each:

    $46 x13  ~418B   spawns $55  UNPORTED, ~1130B   -> ~1550B for 13 records
    $48 x2   ~612B   spawns $54  UNPORTED
    $43 x1   ~270B   spawns $44  UNPORTED
    $4C x1  ~3044B   spawns $4E, $50, $52 and $58 -- ALL FOUR UNPORTED
    $8E x6   ~468B   standalone      <- the best of what is left
    $1B x5  ~1020B   standalone
    $1A x4  ~1002B   standalone
    $81 x3  ~1452B   standalone
    $49 $4A $4B x2   standalone
    $47 x1  ~1492B   standalone
    $B0 x1           standalone

**Four of the thirteen pull in an unported child, and one of them pulls four.** `$8E` -- six records
and standalone -- is the next target rather than `$46`. The edges are asserted in
`w314stage5scope.test.js` as dependency edges rather than as byte counts, because the edges are what
the ROM says while the byte counts are bounded by the next table entry rather than measured.

That is a correction to my own W314 ranking, made before it cost a wave rather than after.

## AND TYPE $59 WAS THE CHEAP ONE ALL ALONG

Sixty-four bytes of handler, twenty of init body, one script record -- and it is not an enemy. It is
a timed source: while the scroll clock is under `$9C` it enqueues a deferred type-`$3F` spawn on a
cadence, and at `$9C` it frees itself. Type `$3F` is `$265850`, ported in W199, so it was the only
one of the fifteen with a child that was already there.

## `$263684` WAS ALREADY PORTED, UNDER ANOTHER NAME

`moveq #$3F,D0 / jsr $263684` looked like a blocker -- `src/mover.js` throws at `$263684` saying
"the enemy subsystem is not ported", and `src/midboss.js` counts a drop there. Both were written
before W21 landed the deferred queue. `$263684` **is** `enqueueDeferred(ram, type, DEFQ_D1.FIXED00)`:
the queue at `$815EAA`, stride `$50`, cap `$C80` = 40 entries, three entry points differing only in
D1.

Asserted from the ROM rather than from the reading -- the routine's `$815EA8` read, its `$C80`
compare, its `$815EAA` base and its `addi.w #$50` are all pinned -- so "already ported" is checkable.

`mover.js`'s message is left alone: fixing it means porting mover kind 18's spawn arm, which is a
different wave. It is recorded here so that wave knows the primitive is waiting for it.

## THE TWO-BYTE-FIELDS IDIOM, LOAD-BEARING THIS TIME

The init body's `move.w #$6,($18,A5)` writes a WORD, so the byte at `$18` becomes **zero** and the
byte at `$19` becomes 6. The handler's `subq.b #1,($18,A5)` reads that zero, borrows on the first
frame, and reloads from `($19,A5)`.

**So the first spawn is immediate and the period is seven frames, not six.** Reading the word as one
counter of 6 gets both wrong. The test walks sixteen frames and asserts the spawns land on 0, 7 and
14 -- which is the shape of the claim rather than a single value.

Third wave in a row this idiom has mattered: W316's `move.w #$3,($24,A5)`, W273 where it was first
written down, and now this.

## THE THREE GATES, IN ORDER

    265a14  cmpi.w #$9C,$8130CE / blt   the clock -- SIGNED, and it only rises: a lifetime
    265a28  tst.w $8130D2 / bne         the motion freeze
    265a32  tst.w $8130D8 / bne         the midboss gate
    265a3c  subq.b #1,($18,A5) / bcc    only then the cadence

Both gates sit BEFORE the cadence, so a frozen frame does not consume a tick -- a port that
decremented first would drift the period. And the free check is the very first instruction, so a
frozen frame past `$9C` still frees the record. All three orderings are asserted.

## Changes

* `src/handlers.js`: `handler59`, `T59`, the registration.
* `src/initbody.js`: the `$2659E4` body.
* `tools/export-tables.py`: one window, `$2659F8 + $1C`, ending exactly at the handler. 408 windows.
* `tests/w317type59.test.js`, 10 assertions.
* `tests/w314stage5scope.test.js`: the list down to thirteen/43, and the new dependency test.
* Four count pins moved (handler list, adapter 66 -> 67, init bodies 71 -> 72, `enemy_types`
  78/48 -> 79/47).

## Order for the next wave

1. **TYPE `$8E`** -- six records, ~468 bytes, standalone, and the best of the thirteen by that
   measure. Then `$1B` (5), `$1A` (4), `$81` (3) and the three standalone twos.
2. **Leave `$46` until `$55` is done**, `$48` until `$54`, `$43` until `$44`, and `$4C` last -- it
   wants four children.
3. Stage 5's boss and end sequence, then **the loops**.
4. **`$280252`** still blocked on measuring A0 at `$28029A` (W288).
5. `$23E45A`, the sixth zooming-family member; gates the two name-entry panels.
6. Mover kind 18's spawn arm, now that `$263684` is known to be available.
