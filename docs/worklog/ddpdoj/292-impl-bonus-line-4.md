# W292: bonus line 4, and it carries TWO loop-2 rules

Status: DONE. Suite 2014/2014 (2008 + 6), sweep 0 missing on both, run before the commit.

Four of the nine bonus lines are in. This one takes the port's translated loop-2 rules from
five to **seven**.

## Starting state

W291 committed and pushed at `90f08a0`, suite 2008/2008.

## TWO GATES ON `$813098`, AND THEY ARE NOT THE SAME TEST TWICE

    260208  tst.w $813098 / beq $26022A     <- GATE ONE
    26028c  tst.w $813098 / bne $26029C     <- GATE TWO, opposite sense

    loop 1   the pointer gets the DIP word from $2600CE, and $286FB4 RUNS
    loop 2   the pointer gets $8130C2/$8130C4 instead, and $286FB4 is SKIPPED

One `beq` and one `bne`, in the same routine, on the same word. **A port that shared one flag
between them would get exactly one of the two backwards**, and both arms would look plausible.
Asserted separately.

With W241's zero-lives extend, W250's A1 6 ring, A4 id6's two and W270's `$260ACA`, that is
seven translated loop-2 rules.

## AND IT IS NOT THE SEVEN-ROW STACK

`$2600D8` paints all seven HUD rows. This line paints the palette set (`$241688`, W274) and
then **at most one row** -- `$286FB4`, which is `extendInit286FA6`'s **SIDE-1 arm**, called
unconditionally rather than through `($17,A6)`.

Reading that as "the row for this side" would be wrong twice over: wrong arm, and conditional
on the loop. The test drives a SIDE-0 record and asserts P2's threshold is seeded while P1's
is not.

## `($6,A0)` IS THE LOOP NUMBER, AND THE ENDIANNESS IS THE POINT

`$260238 move.b $813099,($6,A0)` where `$2600D8` writes a literal 0. 68000 is big-endian, so
**`$813099` is the LOW byte of the very word the two gates test** -- the object is told WHICH
LOOP it is in.

This wave got that backwards first: the header called `$813099` the high byte, and the probe
set it directly, which made the loop word non-zero and sent BOTH arms down the loop-2 path.
The measurement looked like a code defect and was a test defect. Corrected, and the test now
drives loops 0, 1 and 2 and asserts `($6,A0)` carries each.

Worth recording as its own trap: **a byte write into half of a word that something else
`tst.w`s changes that test's answer.** Setting `$813099` to `$5A` makes `$813098` read `$005A`,
which is "in loop 2".

## Order for the next wave

1. **`$2602B6`, bonus line 5.** Five remain. Its head is `lea $8130FA,A2 / lea $81311E,A3 /
   lea ($1C,A2),A0` -- it takes BOTH records at once rather than the one it is handed, which
   is a shape none of the first four has.
2. **The HIGH-SCORE INSERT** (`$287BD2`/`$287C08`/`$287C3E`/`$287CEE`), W290's deferred gap.
3. **`$280252`** stays blocked on measuring A0 at `$28029A` (W288).
4. `$280BCE`'s 5/6/7 need `fillGeneralImpact280B3E` parameterised on the speed draw.
