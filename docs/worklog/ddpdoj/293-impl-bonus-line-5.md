# W293: bonus line 5 is the TEARDOWN, and it explains line 2's field choice

Status: DONE. Suite 2019/2019 (2014 + 5), sweep 0 missing on both, run before the commit.

Five of the nine bonus lines are in.

## Starting state

W292 committed and pushed at `4a0d3f3`, suite 2014/2014.

## THE FIRST LINE THAT DOES NOT TAKE THE RECORD IT IS HANDED

    2602b6  lea $8130FA,A2 / lea $81311E,A3      <- BOTH records
    2602c2  nine x { lea <handle>,A0 / jsr $241238 }
              ($1C,A2) ($1C,A3)                  the type-$B handles line 2 made
              ($20,A2) ($20,A3)                  the type-$D handles line 2 made
              $813148 $813144 $81314C $813150 $813154
    260326  jsr $28C170 / jsr $28C0FC            two cues
    260332  move.w #$E,D0 / jsr $241182          ONE object, type $E
    26033c  (A6) = 0 / ($2,A6) = 0 / rts

**It tears down what line 2 built, for both sides at once**, which is why it reaches past
its own record. W290 recorded that line 2 puts the type-`$D` handle at `($20,A6)` and the
type-`$B` handle at `($1C,A6)` and noted only that three fields for three objects meant a
reused field would silently drop a handle. **This is what the choice was for**: the four
kills here are exactly those two fields on both records, so the pairing is what makes either
line legible. Neither field choice looks meaningful alone.

## `$241238` TAKES A POINTER, NOT AN ID

`$241252 move.l (A0),(A1)` dereferences, so every one of the nine call sites does
`lea <field>,A0` first. The port's `queueKill(ram, id)` takes the VALUE -- the same
convention `hud.js` uses at `$28D518` -- so each of the nine dereferences.

Passing the ADDRESS would queue a kill for a handle equal to a RAM address, which the drain
would **silently fail to match**: no throw, no note, just objects that never die. Asserted
both ways -- the queued value is the handle, and it is not the field's address.

## THE TYPE-`$E` HANDLE IS DROPPED, DELIBERATELY

Lines 1, 2 and 4 all follow `jsr $241182` with a `move.l D0,(...)`. This one does not: no
field of the record changes. So whatever type `$E` is, it finds its own way out, and a port
that "helpfully" stored the handle would invent state. Asserted by checking `($18,A6)`,
`($1C,A6)` and `($20,A6)` are all still zero afterwards.

## Recorded, not relied on

The kill queue is LIFO -- `$24126C` subtracts before reading, so the last request queued is
the first applied. Nothing in this line depends on the order, but the test pins the QUEUE
order as the ROM's (both records per field, then the five globals) so a later reader does not
assume FIFO and quietly reorder them.

## Order for the next wave

1. **`$260348`, bonus line 6.** Four remain. Its head is
   `move.b #$2,($2,A5) / move.w #$0,(A6)` -- it writes an OBJECT's state byte through A5,
   which none of the first five does, so A5 must be live at entry and that wants checking
   before transcribing. **The same class of question that stopped `$280252` in W288**, so
   check it first rather than last.
2. **The HIGH-SCORE INSERT** (`$287BD2`/`$287C08`/`$287C3E`/`$287CEE`), W290's deferred gap.
3. **`$280252`** stays blocked on measuring A0 at `$28029A` (W288).
4. `$280BCE`'s 5/6/7 need `fillGeneralImpact280B3E` parameterised on the speed draw.
