# W290: `$260056` -- bonus line 2, and it is what CREATES the tally screen

Status: DONE. Suite 2005/2005 (2000 + 5), sweep 0 missing on both, run before the commit.

Two of the nine bonus lines are now in. This one closes a note that has been open since D9.

## Starting state

W289 committed and pushed at `ba7e21a`, suite 2000/2000.

## THE LINE

    260056  jsr $23C668                    COUNTED, as line 1 counts it
    26005c  jsr $25FD94                    liveSides25FD94 -- ported W277
    260060  tst.w $803926 / bne $2600C2    a gate: set -> do nothing but re-post
    26006a  ($17,A6) ? $287C08 : $287BD2   the HIGH-SCORE CHECK, carry = "no"
    26007c    carry CLEAR -> ori.b #$1 (or #$2) into $8130CC
    26009a  D0 = $D / jsr $241182 / ($20,A6) = D0 / ($7,A0) = ($17,A6)
    2600ae  D0 = $B / jsr $241182 / ($1C,A6) = D0 / ($7,A0) = ($17,A6)
    2600c2  (A6) = 0 / ($2,A6) = 0 / rts

## TYPE `$B` IS OBJECT DISPATCH `[11]`, AND THAT CLOSES A NOTE FROM D9

`docs/DOCKET.md`'s D9 entry has said since W231:

> the game-over arm arms dispatcher request 2, which is `$260056`, the credit/continue
> entry. That creates object types `$D` and `$B`, and type `$B` is the same unported
> `$25DBB4` that D11 is about, so the two meet there.

`$25DBB4` is the stage-clear screen, ported in W276. So **the creator and the created are
both in the tree now**, and this line is what brings the tally screen into existence. The test
asserts `[11]` is registered in `main.js` AND that the object this line creates carries the
side at `($7,A0)` -- which is the byte `[11]`'s own dispatcher reads.

## THREE FIELDS FOR THREE OBJECTS

Line 1 keeps its one handle at `($18,A6)`. This line keeps TWO, at `($20,A6)` for type `$D`
and `($1C,A6)` for type `$B`. A port that reused one field would silently drop a handle and
nothing would throw -- so the test asserts all three are distinct and that `($18,A6)` is left
alone.

## THE HIGH-SCORE CHECK IS ONE COUNTED GAP, DELIBERATELY

`$287BD2`/`$287C08` are a P1/P2 pair. Each loads a side's score state -- the totals
`$81B440`/`$81B444`, the overflows `$81B44C`/`$81B44E`, the words `$2600D8` posts
`$813084`/`$813088`, the chain high-waters `$81B632`/`$81B634` and the digit states
`$81B49A`/`$81B49E`, **all already named in `hud.js`** -- into `$81B420`/`$81B430`, then share
`$287C3E`, which writes the loop and stage, calls `$287CEE` for a slot, and compares overflow
words.

That is a high-score TABLE INSERT: a subsystem, not a routine, and BCD comparison work wants
its own wave rather than the tail of this one. **Its carry sets one bit of `$8130CC` and
affects nothing else in this line**, so deferring it costs exactly that bit -- which is why
the line is worth landing now with the gap named per side.

## The gate does nothing but re-post

`$260060 tst.w $803926 / bne $2600C2` goes straight to the tail: no objects, no high-score
check, and the request still goes back so the driver returns. Asserted, because a port that
returned early WITHOUT re-posting would stall the tally forever on that gate.

And `$25FD94` runs BEFORE the gate, so the live-side recount happens even on the do-nothing
path. Also asserted, on both arms.

## Order for the next wave

1. **`$26010E`, bonus line 3.** Seven remain after it. The three traps from line 1 are worth
   expecting throughout: the counter is a POINTER, the borrow is `bpl` so a counter of 1 runs
   one more frame, and the fill's source fields differ per line.
2. **The HIGH-SCORE INSERT** -- `$287BD2`/`$287C08`/`$287C3E`/`$287CEE`. Every RAM address it
   reads is already named, so the work is the comparison logic and the slot walk, not the
   addressing.
3. **`$280252`** stays blocked on measuring A0 at `$28029A` (W288), which also unlocks 9, 10
   and 11.
4. `$280BCE`'s 5/6/7 need `fillGeneralImpact280B3E` parameterised on which RNG draw sets the
   speed -- surgery on the routine every impact kind flows through, so it wants a fresh start.
