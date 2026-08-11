# W304: the tag is a search key, and the slot pointer never had a reader

Status: DONE. Suite 2148/2148 (2133 + 15), no skips. Sweep 0 missing on both.

Four waves left the same question open in four different words. W300 called `$FF`/`$FE` a "not
entered yet" sentinel. W301 found the character table it sits in and confirmed the entry is
three initials. W302 found the tag could never reach the display's font and said so as a
constraint on "whatever writes the name". W303 named finding its reader as the next job.

It has two readers, and they settle what the tag is FOR.

## Starting state

W303 committed and pushed at `5fded71`, suite 2133/2133.

## THE TAG IS A SEARCH KEY

    $28F6E2 / $28F6EA -> $28F6F4    find the tagged row and gather every field of it
    $28F7C8           -> $28F7D2    write three initials INTO the tagged row

Both scan the 12-byte array for an entry whose FIRST LONG equals the tag. `$28F6FA cmp.l
(A0),D0` and `$28F7D8 cmp.l (A1),D0`, each stepping `adda.w #$C` on a miss so the walk is by
ENTRY. So the insert stamps the tag in order that later code can find the row again **without
carrying a pointer.**

**Which is why `$81B42C` and `$81B43C` have zero references in the build.** Those are the
absolute forms of the `($C,A4)` slot pointer, and W302 burned a search on the assumption that a
pointer written is a pointer read. It is not: the pointer is internal to `$287C3E`, which reads
it back at `$287C7A` only to stamp the tag through it, and then nothing ever looks at it again.
The scan is now an assertion in the test file rather than a claim in a comment.

Generalising it, because this is the second time this session the same shape has cost a search:
**a stored pointer with no readers means the data is found another way.** Look for what is
compared against the data, not for what holds its address.

## AND THE TAG VALUES ARE ARITHMETIC, NOT MAGIC

    28f7c8  moveq #$0,D0
    28f7ca  move.w ($2C,A4),D0      the SIDE, 0 or 1
    28f7ce  not.b D0                -> $FF or $FE

`$FF` is `~0` and `$FE` is `~1`. So `$287BD2`'s `move.l #$FF,D6` and `$287C08`'s `#$FE` are
side 0 and side 1 complemented, and this is the routine that reconstructs them from a record
field. Three waves carried the pair as opaque constants; `tagForSide` is now the one place the
relationship lives, and the test asserts it against what the two heads actually stamp.

The complement also explains W302's finding from the other end. The display indexes its
character font with the stored value UNSCALED, so a valid character is a small multiple of four.
`~0` and `~1` are the two largest bytes there are, so **the tag being out of band is a property
of `not.b`, not a coincidence.** And the writer overwrites the tag with the name's first
character, so by the time a row is drawn either it was never tagged or the name has replaced
the tag. The constraint W302 recorded is satisfied structurally.

## WHAT THE LOOKUP HANDS BACK

Six addresses and two packed longs, covering eight of the nine arrays -- everything except the
12-byte entry it just matched:

    A2 = $8038A6 + i*2   digits      then REUSED as $803874 + i*2   loop
    A3 = $8038B0 + i*2   overflow    then REUSED as $80389C + i*2   chain
    A5 = $803888 + i*2   ship
    A6 = $803892 + i*2   style
    A1 = $803824 + i*4   score       (`add.w D0,D0` a SECOND time)
    D2 = overflow << 16 | digits
    D3 = style    << 16 | ship

The two `swap` pairs each load the HIGH half first, so a pair the wrong way round yields two
plausible-looking longs -- pinned with distinguishable values. And `add.w D0,D0` appears twice
with the second occurrence turning the word index into a long index; applying it once gives a
score pointer into the wrong entry.

The reuse of A2 and A3 for a second column each is the kind of thing that reads as a
transcription slip later, so both are named in the returned object.

## THE WRITER

`move.w #$2,D7` with `dbra` is THREE longs -- the n+1 this port has been bitten by twice
(W297's panel segments, W299's `moveq #$4,D0`). Two would leave the third character holding
whatever the insert's shift dragged down.

A miss is a **silent no-op**: the ROM falls out of the `dbra` with no return value and writes
nothing. Ported faithfully, with a test asserting main RAM is byte-identical afterwards. A side
index above 1 throws instead, because `not.b 2` is `$FD` and `$287C3E` never stamps that, so no
row could ever match and the board would scan five entries and quietly do nothing.

## Changes

* `src/hiscore.js`: `tagForSide`, `tagLookup28F6F4`, `tagLookupForSide`, `tagWrite28F7C8`, and
  the `TAG` block.
* `tests/w304hiscoretag.test.js`, 15 assertions, including an end-to-end round trip: search,
  insert, stamp, find by tag, write the name, and assert both the name and the table's order.

No new ROM window: everything here reads RAM, and the two heads' immediates are in the
instruction stream.

## What is still open in this subsystem

The two routines above are the commit step. What calls them is a screen: `$28F428` does the
lookup after a `movem.l A0-A6`, and `$28F6A8` calls the writer after a loop at
`$28F67A..$28F6A6` that compares three longs of `(A1)` against three of `(A0)` across the
table -- **a duplicate-name check** that branches to `$28F59E` on a match. A0's source, A4's
identity, and `($12,A4)`/`($2C,A4)` are the next thread.

## Order for the next wave

1. **`$28F428` and `$28F59E..$28F6AC`**, the name-entry screen proper: the duplicate check, the
   cursor, and whatever fills A0's three longs. `$8130CC`'s two bits are read at `$28F350` and
   copied to `($5,A5)`, which is how the screen learns which sides owe a name.
2. **`$280252`** still blocked on measuring A0 at `$28029A` (W288).
3. `$280BCE`'s last five: 2 (`$280CF8`), 3 (`$280D10`), 17 (`$280DBA`), and 1 and 16 which
   belong to `allocBee27F92A`.
4. The four other announcement-poster caller regions, then D11's remainder.
5. Stage 5 and both loops.
