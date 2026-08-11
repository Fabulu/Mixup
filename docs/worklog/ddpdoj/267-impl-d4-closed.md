# W267: DOCKET D4 CLOSED

Status: DONE. Suite 1821/1821. **Both sweep forms report ZERO missing**, stage 1 and
stage 2, run before the commit.

The owner reported "level 2's mid boss is mostly invisible except for two little turrets."
The page can now resolve every descriptor the port draws through stage 2.

    stage 1:  NOT in the bundle: 0 accounting for 0 draws   (unchanged)
    stage 2:  NOT in the bundle: 0 accounting for 0 draws   (was 129 / 19791 at W265)

## Starting state

W266 committed at `9e22854`, suite 1821/1821, streams 4033, six runs and 81 streams left.

## THE STRIDE-WALK PROBE

W266 got one stride by feeding the range guard a deliberately wrong extent and reading its
complaint. This wave built that on purpose, as a mode of the exporter itself so it shares
`romExtent` and the mask tables rather than re-deriving them:

    node tools/export-web.mjs --extent 0x12D650
    node tools/export-web.mjs --extent 0x1CA008 --extent 0x33252C

It walks the cartridge's chain from each address, prints every point where the stride
CHANGES with the run length that ended there, and exits without writing the bundle -- so it
is safe against a shipped tree. A family closed by a stride change is exactly what
`STRUCTURE_RANGES` rows claim, so the probe's output maps one-to-one onto the work.

What it cannot answer is which of the families a row should claim. That stays a judgement
about what the code reads, and this wave's judgement is written below.

## Sixteen families, and the arithmetic checks out

    $12D650   1 x $43C     $1CA008  40 x $1C      $326EAC   1 x $2A4
    $12DA8C   8 x $514     $1CA468   2 x $64      $327150   1 x $624
    $13032C  24 x $4D4     $1CA530   1 x $104     $327774   2 x $284
    $13770C   1 x $1B4     $1CA634  67 x $64      $327C7C   2 x $34
    $1ECF58   4 x $1884                           $327CE4   4 x $704
    $33252C  10 x $C                              $3298F4   2 x $1B4

The first four sum to 34, which is EXACTLY the 34 descriptors the stage-2 run drew in that
region -- so there the run had already touched every frame of every family. Elsewhere it
had not, and the whole family ships anyway:

- `$1CA634` is 67 frames and the run drew its first TWO. Shipping two would be the
  "measured floor going short" this file's own header warns about.
- `$1ECF58` is ONE family of four at stride `$1884`, and the run drew three of them at
  `$1ECF58`, `$1F0060` and `$1F18E4`. My sweep's `$2000` grouping had reported those as two
  separate runs; the probe showed one family.
- `$327C7C` is two frames `$34` apart. The sweep reported a `$68` gap there, which is this
  family with its middle frame undrawn -- a gap in a RUN is not a stride.

Every extent and count was read off the chain and then re-verified by `STRUCTURE_RANGES`'
own walker, which throws unless it lands on the stated end after the stated count. Sixteen
claims, sixteen exact landings, no iteration.

## The cost

Streams 4033 -> 4194: 161 new. The eleven Stage-4 census tests that pin the total moved by
one line each, for the second time in two waves. They keep earning it -- a harvest change
that shipped the wrong count would fail eleven ways rather than passing quietly.

## What D4 was, in one line

Not a producer gap and not a sprite-queue gap: the harvest had been sized off runs that
never left stage 1, so stage 2's art was simply never asked for. Both halves of that are now
fixed -- the sweep reaches stage 2 (W265) and the harvest is sized by the cartridge (W266,
W267) rather than by a run.

## Docket status

    D1  fixed (W226)          D7  open -- hyper gauges
    D2  fixed (W226)          D8  open -- ship exhausts
    D3  FIXED (W264/265/266)  D9  fixed (W227/228/231)
    D4  FIXED (W265/266/267)  D10 open -- mobile landscape
    D5  fixed (W230)          D11 partly fixed; the rest is the animation-object
    D6  fixed (W234)              execution engine, and $28C186 is a BGM command
                              D12 fixed (W253/263 handoffs)

## Order for the next wave

1. D10, the mobile landscape browser bar. Self-contained web work, and the owner sees it
   immediately.
2. D7's gauges, which the handoff notes are likely reached through the remaining `$240DC2`
   call sites in `items.js`.
3. The stage-2 run's next stop is still `$286AAA`, a score-chain arm. Now that D4 is closed
   it is the thing standing between the sweep and a longer stage-2 run.
