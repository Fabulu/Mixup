# W295: bonus line 7, and `$813142` turns out to be a LEASE

Status: DONE. Suite 2028/2028 (2023 + 5), sweep 0 missing on both, run before the commit.

Seven of the nine bonus lines are in, and this one reframes something W273 recorded.

## Starting state

W294 committed and pushed at `f328c05`, suite 2023/2023.

## THE COUNTER GOES BACK UP

    26035a  addq.w #1,$813142       <- the word $2600D8 DECREMENTS at $260112
    260360  move.l ($20,A6),D0      the type-$D handle line 2 stored
    260364  jsr $241298             resolve it to a record
    26036a  move.b #$3,($2,A0)      set THAT object's state to 3
    260370  (A6) = 0 / ($2,A6) = 0 / rts

W273 ported `$260112 subq.w #1,$813142` and recorded that it "is an UNGUARDED decrement, so
it wraps past zero", which was true and read as a quirk. **It is not a quirk: `$813142` is a
LEASE.** `$2600D8` takes one per post and line 7 gives one back, so nothing guards the
decrement because something else is expected to return it. Asserted, along with the fact that
it really is the same word.

## LINES 6 AND 7 ADVANCE DIFFERENT OBJECTS, BY DIFFERENT ROUTES

    line 6   ($2,A5) = 2     the CALLER's object, through a register the driver leaves
    line 7   ($2,A0) = 3     the TYPE-$D object, through the handle line 2 STORED

Two objects, two states, two routes. A port that shared a helper between them would be wrong
twice, so the test drives both in one world and asserts the two records differ.

This is also the **third** wave to depend on line 2's field choice: W290 stored the handles,
W293 killed them, W295 reads one. That choice looked arbitrary when W290 landed it and now
three waves rest on it.

## `$241298` PORTED, AND A MISS IS NOT AN ERROR

The handle resolver walks the 20 object slots comparing `($4C,A0)` against the id, and on a
miss returns **`$80D51C` -- the same dummy `stageCreate` hands back on a full queue**, with
carry set. `objalloc.js` already named that address.

**An object dying between the frame that stored its handle and the frame that uses it is
normal**, so the cartridge writes to the dummy and carries on. A port that threw there would
stop the game on an ordinary event, so `resolveHandle241298` returns `{rec, found}` and line 7
writes the 3 wherever it landed -- dummy included. Asserted both ways.

One detail worth its own assertion: `$2412A4 move.l ($4C,A0),D2 / beq` **skips ids of 0 as
free slots**, which is what makes a dropped handle read as "gone" rather than as slot one.

## Order for the next wave

1. **`$26037C`, bonus line 8.** Two remain. Its head is `lea $8130FA,A2 / lea $81311E,A3` --
   the same both-records shape as line 5, so it is likely another cross-side operation and
   worth reading alongside `$2602B6` rather than fresh.
2. **The HIGH-SCORE INSERT** (`$287BD2`/`$287C08`/`$287C3E`/`$287CEE`), W290's deferred gap,
   and the largest single thing left in this subsystem now that the lines are nearly done.
3. **`$280252`** stays blocked on measuring A0 at `$28029A`. W294's rule says why it is
   different from line 6's A5: its A0 feeds arithmetic.
4. `$280BCE`'s 5/6/7 need `fillGeneralImpact280B3E` parameterised on the speed draw.
