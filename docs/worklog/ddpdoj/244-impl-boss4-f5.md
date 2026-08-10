# W244: Stage-4 boss A4/F5

Status: IMPLEMENTED BY W246, WITH THREE CORRECTIONS TO THIS SPEC

W246 translated F5 and found three things below to be wrong: INIT DOES fall through,
the STEP has seven arms and not four, and arm 4's gate is A3 4 rather than A1 4. Read
[246-impl-boss4-f5-step.md](246-impl-boss4-f5-step.md) alongside this file; the rest of
the spec held, including that nothing in F5 needed a new helper.

W225 reserved this and banked its opening recon. This wave finished the recon and
confirmed every dependency, which changed the estimate: nothing in F5 needs a new
helper. It is a large transcription of code the port can already feed.

Nothing below is a guess about what a routine does.

## Starting state

W243 is committed at `6c6cf8e`, suite 1667/1667.

## Where it sits

`$2A0088[5]` = `$2A0CF6` (INIT) / `$2A0D16` (STEP), which MAIN3 starts once the W224
damage transition reaches its target (`a4Start25980C(ram, 5)` at `$29F866`). Today
that arming is a live edge into an `Unreached`, which is why this is the Stage-4
boss's frontier.

## INIT, `$2A0CF6`

    moveq #$4,D0 / jsr $2598D0        seqStart(4) -> MAIN4 $29F8CC/$29F8F0
    move.b #$1,$2(a4)                 the BIT field, bit 0 set
    move.b #$0,$3(a4)                 the second bit field
    move.w #$0,$4(a4) / $6(a4)

Note it does NOT fall through: `$2A0D16` is the STEP's own entry.

## STEP, and it is a BIT machine rather than a state index

Three independent arms, each gated on a bit of `$2(a4)` or `$3(a4)`, all run in the
same call in this order:

**1. `$2A0D16`, bit 0 of `$2(a4)` -- THE PODS OPEN.**
Refuses when `$18E(a6)` already equals `$F000`. Steps `$6(a4)` by 4, then
`$18E(a6) -= $6(a4)` and `$192(a6) += $6(a4)` -- the same two part-offset words
`placeBoss4Parts29F50E` already adds into the linked parts at `$82`/`$A2`, so the pods
visibly spread. When `$192(a6)` reaches `$E00` it latches `$192 = $E00`,
`$18E = $F200`, clears bit 0 and SETS bits 1 and 2, zeroes `$198(a6)`/`$19A(a6)` and
`$A(a4)`, aims both pods (below), then loads `$4(a4) = $10`, `$C(a4) = $10`,
`$10(a4) = $808`, `$12(a4) = 0`, `$14(a4) = 4`.

The two aim blocks (`$2A0D76` and `$2A0DEE`) are the same seven instructions twice,
once per pod: a `$242B3C` byte, `asr.b #1`, `+4`, with the SIGN chosen by comparing
that pod's own `$82`/`$A2` against `$5A00` and `$6400`, then `$241D34`, and the result
stored in `$198(a6)` / `$19A(a6)`.

**`$241D34` IS ALREADY PORTED.** It is `MoveTables.shotVector(speedIndex, angleByte)`
in `vectors.js`, whose header names the address and says in as many words that it is
not `$241812`. It reads `$200920` and the `$241AF4` fold, both already exported. That
is the twelfth availability check this session to come back positive.

**2. `$2A0E84`, the `$3(a4)` bits -- THE DESCENDANTS.**
Four gates in sequence, each using `$2599B4` (`a3Running`) and `$259962`/`$259A18` to
avoid double-starting:

    bit 0 set: if A3 6 and A3 8 are both idle -> start A3 5 and A3 7, bit 0 -> bit 1
    bit 1 set: if A3 5 and A3 7 are both idle -> start A1 8, clear bit 1
    bit 2 set: if A3 6 and A3 8 are both idle -> start A3 5 and A3 7, bit 2 -> bit 3
    bit 3 set: if A3 5 and A3 7 are both idle -> clear bit 3

**3. `$2A0F58`, bit 1 of `$2(a4)` -- THE HOMING.** Counts `$4(a4)` down and re-runs
the same per-pod aim as arm 1, so the pods track while they fire.

**4. `$2A106E`, bit 2 of `$2(a4)`** -- gated on A1 4 NOT running (`$2599B4` with
D0 = 4), counts `$C(a4)` down, and drives `$10(a4)`/`$12(a4)`/`$14(a4)`.

## What is still missing, and it is only descendants

- MAIN4 `$29F8CC`/`$29F8F0` -- A0 entry 4, which INIT starts.
- A3 id5 `$2A1506` and id7 `$2A1562` -- the two D-scripts arm 2 starts.
- A1 id8 -- the attack arm 2 starts.

All four are unregistered, so a ported F5 will arm them and the next scheduler walk
will throw by address. That is the correct frontier and the same shape W224 shipped:
translate the conductor, then follow its descendants.

## Why this is a spec and not code

I stopped here deliberately. This wave is the twelfth in one session; two of the
earlier ones shipped a defect I caught only because a test asserted the right thing
(W238's dropped high word, W243's three tails read as one), and one shipped a syntax
error I committed before running the suite. F5 is a three-arm bit machine with two
paired aim blocks -- the exact shape those two defects took -- and the honest move is
to write it with a fresh budget rather than at the end of a long one.

W234 is the precedent: the spec that came out of W233 made the implementation a single
clean pass, and its estimate was right to the routine.

## Order for the next wave

1. MAIN4 first. It is small, and F5's INIT starts it, so F5 without it arms an
   `Unreached` on its own first frame.
2. F5's arm 1 with the two aim blocks, tested on the latch and on both aim signs.
3. F5's arms 2, 3 and 4.
4. Then D5/D7/E8, at which point the Stage-4 boss's second phase runs end to end.
