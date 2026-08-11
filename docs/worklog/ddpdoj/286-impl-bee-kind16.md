# W286: kind 16 was never a gap -- the hook table already pointed at a ported routine

Status: DONE. Suite 1988/1988, sweep 0 missing on both, run before the commit.

W284 found kind 16 of the bee pool throwing `Unreached $280CEE` and filed it as a real named
gap. It is not one. The family check, once more.

## Starting state

W285 committed and pushed at `505ae40`, suite 1987/1987.

## THE TABLE ANSWERS IT IN ONE LINE

    $280BCE[ 1] = $280CEE      kind 1, THE MEDAL      ported since W111
    $280BCE[16] = $280CEE      kind 16, the flying variant -- **THE SAME ENTRY**

Exactly two of the twenty hooks are `$280CEE`, and they are those two. So there was never
anything to transcribe for kind 16: it dispatches to the same two instructions,
`move.w #$9601,($1E,A0) / bra $27F926`.

`runFillHook` refused it anyway, on the reasonable-looking grounds that "only kind 1's hook
had been transcribed" -- which was true of the CODE and false of the TABLE. The port was
refusing a path it already had.

## AND THE REFUSAL WAS WORSE THAN A REFUSAL

`allocBee27F92A`'s own contract accepts both kinds -- `$27F92A`'s refusal is "not 1 and not
16" -- so the throw sat inside the allocator's declared range, reachable from its own
documented input. Worse, it fired **after the slot was claimed**, so every attempt leaked one
of the ten reserved slots. Ten attempts would have exhausted the bee pool for the rest of the
run with no note and no throw of its own.

Nothing reaches it today, because the carrier passes kind 1 (`$2767DE` moves `$0004`). That is
why it cost nothing so far and why it would have been very hard to find later.

## What changed

Three lines of behaviour: `runFillHook` accepts `KIND.beeFlying` alongside `KIND.bee`, and its
remaining throw now says what is actually true -- that those two are the only entries of
`$280BCE` pointing at `$280CEE`, and that the other eighteen need their own transcription with
`$280BCE + kind` naming which.

W284's test is rewritten from "kind 16 throws, and that is a gap" to "kind 16 shares the hook,
and the hook's whole effect is one word, so identical is checkable" -- both kinds are asserted
to leave `$9601` at `+$1E`. A second test reads the two table entries **out of the image**, so
the claim rests on the cartridge rather than on the port agreeing with itself, and asserts that
exactly two of twenty share the hook -- which is what keeps the remaining throw honest.

## The lesson, which is the same one twice in one session

W275 found `$23F294` was `$23F1FA` byte for byte and needed no new code. W286 found kind 16's
hook was kind 1's and needed no new code. Both were found by looking at the TABLE before
writing the routine.

The heartbeat's rule says it: *before you write a new emitter or routine, check whether it is a
member of a family the port already has.* The addition this wave suggests: **when a dispatch
table is involved, read the table entry itself** -- "this kind is unported" and "this kind's
table slot points somewhere unported" are different statements, and W284 made the first while
the second was false.

## Docket status

    D13 W279   D14 W280   D15 W279   D16 W283
    D17 mechanism proven (W284, W285); next step is a PUBLISH, not a wave
    D18 standing rule -- commit AND push every wave
    D19 standing rule -- record the deployed build id with every report

## Order for the next wave

1. **PUBLISH and ask the owner to look again at D16 and D17.** Unchanged and still the
   cheapest move for the docket -- `export-web.mjs` FIRST, then `tools/publish.mjs`. **It is
   an outward-facing deploy, so it wants the owner's go-ahead rather than a wave's own
   initiative.**
2. **`$280BCE`'s other eighteen finish routines**, or enough of them to drive a long run past
   frame 6482 -- still what caps the item chain short of a boss part death.
3. Then `$25DEAE`/`$25E0EA` and the nine bonus lines at `$25FF52`.
