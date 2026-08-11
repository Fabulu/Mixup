# W271: DOCKET D7 -- the row was written and never called

Status: DONE. Suite 1843/1843 (1836 + 7), sweep 0 missing, both run before the commit.

The owner reported "hyper gauges in UI aren't painted. I don't know if they work at all."
The counting worked. The drawing routine existed. **Nothing called it.**

## Starting state

W270 committed at `4706253`, suite 1836/1836.

## What D7 turned out to be

`hyperStock286ED6` has been in `hud.js` since W113 -- complete, with every constant named
(`$2883E6`, `$81B65C`/`$81B65E`, the `$414000A` active tile) and every branch commented
against the listing. `livesRow2878CC` has been there since W116.

`slideIn284CF2`'s `flags9` bit-0 arm -- the stage-clear and banner frames -- still called
`draw(ctx, 0x286ed6)`, the NOTE those transcriptions replaced everywhere else. Four call
sites, two bodies, dead since the waves that wrote them.

So the answer to "I don't know if they work at all" is that they do, and that is now
asserted: the row draws for both sides, at different positions for P1 and P2, and its icon
tracks `$81B65C` through `$2883E6` so it CHANGES with the stock. Which is what "the gauge
is painted" means for this row.

## Why W269 could not find it, and what fixed that

W269 hunted D7 through the hyper subsystem and came up empty: `hyper.js` has no `note()`
and no `unreached()`, every `$81B642` reference is logic the port has, and the `$2875xx`
cluster is the item spawner. All true, and all beside the point -- because a routine that
is written but not called leaves NO gap of any kind. There is nothing for a scan of gaps to
find.

What found it was reading `hud.js`'s own `DRAWS` table looking for something hyper-shaped,
and seeing "the HYPER STOCK icons `$286ED6` (23 instructions, ZERO RAM writes)" sitting in a
table of things that are noted -- next to two entries whose bodies were three hundred lines
below.

## THE GENERALISATION, checked mechanically

If two transcriptions could sit uncalled, others could. So the test cross-references
`hud.js` against itself: every `draw(ctx, $X)` where the file also has a body named for
`$X` is the same defect, unless it is that body's own `if (!rom)` fallback.

After this wave exactly two survive, and both on purpose: `$240DC2` and `$240EBC` at
`$284970` and `$284BC4`. A note at a TEXT PRIMITIVE means a caller whose own register setup
is untranscribed, which is a different gap and correctly counted.

That check is cheap and it now runs on every suite pass, so the class cannot come back
quietly.

## The two arms the row really has

    $286F0C tst.w $81B63E / bne
      not hypering  ->  $2883E6[$81B65C * 4]      the stock icon
      hypering      ->  $414000A                  a fixed active icon

both through `$240DC2` on the same 3-wide-by-6-tall grid, so the row's SHAPE never changes
and only its tile does. The test proves the two arms differ by comparing the enqueued cells
rather than by reading the constants back.

`$2883E6` already resolved -- no window was needed, which is why nothing ever threw here and
why the sweep reported zero missing all along.

## Docket status

    D1  fixed (W226)          D7  FIXED (W271)
    D2  fixed (W226)          D8  open -- ship exhausts
    D3  fixed (W264/265/266)  D9  fixed (W227/228/231)
    D4  fixed (W265/266/267)  D10 fixed (W268)
    D5  fixed (W230)          D11 partly fixed; the rest is the animation-object
    D6  fixed (W234)              execution engine
                              D12 fixed (W253/263 handoffs)

Ten of twelve closed.

## Order for the next wave

1. **D8, the ship's large exhausts** -- the last open player-visible item. Given this wave,
   the FIRST thing to check is whether `src/shipsprite.js` already has the body and simply
   is not called, before assuming anything is missing. The mechanical check in
   `w271hyperstock.test.js` covers `hud.js` only; `shipsprite.js` deserves the same look.
2. Then `$2600D8` and object `[11]`, which W270 recon'd -- it is the stage-clear SCORE TALLY
   (eight bonus-line routines per side), which is the other half of what the owner asked
   about when he said "maybe even score totalling, which I see none of".
