# W246: Stage-4 boss A4/F5, the whole conductor

Status: DONE. Suite 1682/1682 (1671 + 11), run before the commit.

W244 spec'd this and W245 landed MAIN4, the one dependency F5's INIT starts. This wave
translated F5 itself: `$2A0CF6` (INIT) and `$2A0D16` (STEP), which is the Stage-4
boss's entire second-phase conductor.

## Starting state

W245 committed at `ccd237c`, suite 1671/1671.

## What it is

A BIT machine, not a state index. SEVEN arms, each gated on its own bit of `$2(A4)`,
plus a four-gate chain on `$3(A4)`, all reached in one call:

    bit 0  $2A0D16   the pods OPEN, and latch
           $2A0E84   the $3(A4) chain -- ungated, it runs every call
    bit 1  $2A0F58   the pods PATROL, and it never turns off again
    bit 2  $2A106E   the salvo, and a rendezvous on A1 10
    bit 3  $2A10F0   MAIN7 comes in
    bit 4  $2A1138   the repeating shot, alternating sides
    bit 5  $2A1192   the cycle closes back onto bit 2

so bits 2 -> 3 -> 4 -> 5 -> 2 is the attack loop and it repeats until the boss dies,
with the patrol live beside it the whole time.

Every arm re-reads its byte, so an arm that hands its bit on lets its successor run on
the SAME frame. That is not incidental: the latch sets bits 1 and 2 together, and the
test pins `$4(A4)` and `$C(A4)` at `$0F` rather than the `$10` the latch's tail
literally writes, because arms 3 and 4 each spend a tick before the frame ends. An
assertion of `$10` there would have been asserting a bug.

## The fifteenth positive availability check, and it covered everything

Nothing in F5 needed a new helper. Every scheduler call was already exported:

    $2598D0  seqStart2598D0      $2599B4  a3Running2599B4
    $259962  a3Start259962       $259A18  a1Start259A18   (returns A0, and F5 needs it)
    $259A4A  a1Running259A4A     $259B08  a1Stop259B08

and both aim blocks resolve to `MoveTables.shotVector` (`$241D34`), which W244 had
already confirmed. `$259A18` returning the claimed slot mattered: `$2A1170` writes
`$12(A4)` into `$6(A0)`, the one place in F5 that reaches through a started slot, and
it is what makes consecutive A1 9 starts alternate sides.

## Three corrections to W244's spec, all settled from the image

1. **INIT FALLS THROUGH.** W244 says "it does NOT fall through: `$2A0D16` is the STEP's
   own entry." Both halves of that are true and the conclusion is still wrong:
   `$2A0D10`'s `move.w #$0,$6(a4)` ends at exactly `$2A0D16` with no `rts` between
   them, so the arming frame also spends its first spread step. The same trap W224
   documented for F1. Observable: `$6(A4)` is 4 after INIT, not 0.
2. **FOUR ARMS IS SEVEN.** W244 enumerated bits 0, 1 and 2 of `$2(A4)`. Bits 3, 4 and 5
   exist too (`$2A10F0`, `$2A1138`, `$2A1192`), and they are what make the fight a loop
   rather than a one-shot. The STEP's extent is pinned by code, not by a guess: its
   `rts` is at `$2A11D2` and A4 id6's INIT is `$2A11D4`.
3. **A3 4, NOT A1 4.** W244 says arm 4 is "gated on A1 4 NOT running (`$2599B4` with
   D0 = 4)". Those disagree with each other; `$2599B4` is the A3 walk, so it is A3 4.

## The pod aim, and a gap that turned out not to be one

The aim appears four times (`$2A0D76`, `$2A0DEE` in the latch; `$2A0F6E`, `$2A0FE6`
every patrol frame), one axis wide, and the axis is the LONG one throughout: velocity
`$198`/`$19A`, offset `$18C`/`$190`, position `$82`/`$A2`. Arm 1 drives `$18E`/`$192`
instead, which the placer adds into `$84`/`$A4` -- the SHORT axis. Four offset words,
two axes, and `placeBoss4Parts29F50E` already consumed all four, so the loop closes
through the placer with no change to it.

Read literally the speed index looks alarming. `$242B3C` returns 0..255, `asr.b #1` is
SIGNED and `addi.b #4` wraps, so `andi.w #$ff` admits `$C4..$FF` -- levels 196..255,
a band where the exported set holds only the EVEN levels. I wrote the derivation into
`export-tables.py` before checking, in the shape W65 used for the beam spark, and it
added nothing: `$242BAC`'s 256 bytes are SIGNED JITTER in `[-7,+7]` (15 distinct
values), so the transform's actual range is 0..7 and every one of those was already
exported. The exporter change is reverted; the fact belongs here.

That is worth writing down because the theoretical read and the measured read differ by
30 missing levels, and the cheap check that settled it was enumerating the table rather
than its domain.

## What is still missing, and it is only descendants

F5 arms scripts that do not exist yet, so the next scheduler walk throws by address:

    A3 3, 4, 5, 6, 7, 8      A1 6, 7, 8, 9, 10      MAIN7 (A0 entry 7)

That is the correct frontier and the same shape W224 shipped. A3 5 `$2A1506` and A3 7
`$2A1562` are the two W225 identified first.

## Order for the next wave

1. A3 5 `$2A1506` and A3 7 `$2A1562` -- arm 2's pair, and the first thing the latch
   reaches.
2. A1 8, which arm 2's bit 1 starts once that pair retires.
3. MAIN7, then the A1 6/9/10 and A3 3/4/6/8 family, at which point the second phase
   runs end to end.
