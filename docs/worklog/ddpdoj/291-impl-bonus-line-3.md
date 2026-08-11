# W291: bonus line 3 is `$2600D8`'s second entry point

Status: DONE. Suite 2008/2008 (2005 + 3), sweep 0 missing on both, run before the commit.

Three of the nine bonus lines are in, and this one needed no new code.

## Starting state

W290 committed and pushed at `132a57a`, suite 2005/2005.

## `$25FF52[3]` IS `$26010E`, AND `$26010E` FALLS INTO `$2600D8`

    26010e: movem.l D0-D7/A0-A6,-(A7)
    260112: subq.w #1,$813142            <- and $2600D8's body starts HERE

`$2600D8` opens with the same `movem.l` and then spends nine instructions choosing a side
from D2 and posting two words, before arriving at `$260112`. **`$26010E` is the same body
entered past that choice**, because `$25FF7A`'s driver has already put the record in A6 and
walks both of them itself.

W273 read this and wrote it down -- *"`$26010E` is a distinct entry that skips the side
setup"* -- without knowing what used it. `$25FF52[3]` is what uses it.

So the wave is a refactor: `tallyBody260112` is the shared body, `tally2600D8` chooses a side
and calls it, and `bonusLine326010E` takes the record it is handed. **All 41 of W273/W289/W290's
existing assertions passed unchanged**, which is what says the split is behaviour-preserving.

## Fourth time this session, and the first one a previous wave had half-seen

    W275  $23F294 is $23F1FA byte for byte, with register saves
    W286  kind 16's fill hook IS kind 1's -- the table says so
    W287  eight finish hooks are one body over two parameters
    W291  bonus line 3 is $2600D8's second entry point

Three of those were found by reading a TABLE. This one was found by reading a note a previous
wave had already left, which is the cheaper of the two and only works if the note exists. W273
wrote it because the `movem.l` at `$26010E` was unexplained and it said so rather than
skipping it.

## What the two entries differ in, asserted

The second entry **does not post `$813084`/`$813088`** -- those writes are above it. So a line-3
call leaves the lives-icon words alone, and the test drives side 1's record to prove the
record comes from the caller and side 0's is untouched.

The rest is asserted by comparison rather than by re-deriving: drive both entries against the
same record and the digit records, the extend threshold, the digit state, the `$813142`
decrement and the drawn row count all match.

## And the fall-through is read out of the image

`$26010E` is `48E7 FFFE` and `$260112` is `5379` then the absolute long `$00813142`, with the
same `48E7` opening `$2600D8`. If there were a branch between the two, line 3 would be a
different routine -- so the adjacency is the wave's whole premise and it is checked against
the cartridge rather than against the port.

## Order for the next wave

1. **`$2601F4`, bonus line 4.** Six remain. Worth checking its head against `$2600D8`'s and
   `$25FFA8`'s before transcribing -- three of the first four lines have turned out to share
   something.
2. **The HIGH-SCORE INSERT** (`$287BD2`/`$287C08`/`$287C3E`/`$287CEE`), W290's one deferred
   gap. Every RAM address it reads is already named, so the work is the comparison and the
   slot walk.
3. **`$280252`** stays blocked on measuring A0 at `$28029A` (W288).
4. `$280BCE`'s 5/6/7 need `fillGeneralImpact280B3E` parameterised on the speed draw.
