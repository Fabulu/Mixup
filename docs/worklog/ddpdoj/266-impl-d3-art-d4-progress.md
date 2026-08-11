# W266: D3's explosion is VISIBLE, and D4 is a third smaller

Status: DONE. Suite 1821/1821, stage-1 sweep 0 missing, both run before the commit.

W264 made the port produce the screen clear's explosion. W265 gave it a body so the driver
would run it. This wave ships its ART, so it is now something the owner can see -- and it
takes the same bite out of D4.

    stage 2, before:  NOT in the bundle: 129 accounting for 19791 draws
    stage 2, after:   NOT in the bundle:  81 accounting for 14078 draws
    stage 1:          0, unchanged

## Starting state

W265 committed at `c109cc7`, suite 1821/1821, streams 3985.

## THE CARTRIDGE SIZES THE IMPACT ANIMATIONS, AND IT SIZES THEM ALL THE SAME

The whole wave turns on one measured fact. Every consecutive pair of sprites in
`$280E4A`'s twenty templates is EXACTLY sixteen times a stride:

    $1BCACC -> $1BCD0C   16 x $24        $1BD04C -> $1BD68C   16 x $64
    $1BCD0C -> $1BD04C   16 x $34        $1BD68C -> $1BE2CC   16 x $C4
    $1BE2CC -> $1BE94C   16 x $68        ...which is TWO stride-$34 families

So an impact animation is SIXTEEN FRAMES and its far end is the next template's own
sprite. Nothing here is measured off a run.

Two things had already half-known this and never used it: the port's own
`IMPACT_KIND[...].step` carries `$64` and `$C4` -- those strides -- and `.end` carries
`$1BD68C` and `$1BE2CC` -- those ends. The harvest never read either.

`$1BCACC`'s end is pinned TWICE over: it is template 5's sprite AND it is
`$27FA4C cmpi.l #$1BCD0C`, the wrap constant kind 0's own body compares against.

## Three families added

    [0x1bcacc, 0x1bcd0c, 16]   stride $24 -- kind 0's own, THE SCREEN CLEAR
    [0x1bcd0c, 0x1bd04c, 16]   stride $34 -- template 5's sprite to template 6's
    [0x1be60c, 0x1be94c, 16]   stride $34 -- the SECOND family in template 2's $680 gap

The third is the one a careless reading misses: template 2's gap is `$680`, which is
thirty-two frames of `$34` and therefore TWO families. The first half was already shipped;
a harvest that assumed one family per template gap stopped at its midpoint.

`STRUCTURE_RANGES`' walker verified all three rather than trusting them: it chains by the
cartridge's own `romExtent` stride and throws unless it lands on the stated end after the
stated count. Three claims, three exact landings.

## USING THE GUARD AS A MEASURING INSTRUMENT

`$12D650` is the next family and it is NOT uniform -- the sweep's grouping shows gaps
`$43C`, `$514`, `$4D4` in that run. Rather than guess, I fed the walker a deliberately
wrong extent and read its complaint:

    structure range $12d650: the cartridge's chain runs 1 streams from $12d650 to
    $12da8c; this file says 1 ending at $12d651

so `$12D650`'s own stride is `$43C`, straight out of the cartridge. That technique is the
finding to carry forward: the exporter's consistency check will TELL you the extent if you
give it a wrong one. The six remaining runs need a proper stride-walk instrument -- one
that reports where the stride CHANGES -- and that is the next wave's first task, now with a
known way to build it.

## The sweep prints families now

`--all` lists every missing descriptor and then groups them into runs, reporting each run's
stride when it is uniform and its gap set when it is not. A harvest is added per FAMILY,
not per descriptor, so the grouped view is the one that maps onto the work. It is labelled
a FLOOR in the output itself, because a run's extent is not an extent.

## The cost, and the eleven pins

Streams 3985 -> 4033, which is exactly 3 x 16. Eleven Stage-4 census tests pin that total
and each moved by one line. They are doing their job: a harvest change that shipped the
wrong count would have failed eleven ways rather than passing quietly.

## What is left of D4

Six runs, 81 streams, 14078 draws:

    $12D650 .. $13770C   34 seen, non-uniform (first stride $43C, measured above)
    $1CA008 .. $1CA6FC   26 seen, gaps $1C $40C $64
    $1ECF58              1
    $1F0060 .. $1F18E4   2, stride $1884
    $326EAC .. $329AA8   11 seen, gaps $2A4 $624 $284 $68 $704 $1B4
    $33252C .. $332574   7 seen, stride $C

## Order for the next wave

1. Build the stride-walk probe (a `--extent ADDR` mode on `export-web.mjs`, or a small
   tool over `romExtent`) that reports where a family's stride changes. Then size the six.
2. The stage-2 run's next stop is still `$286AAA`, a score-chain arm, unrelated to D4.
