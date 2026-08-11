# W261: Stage-4 boss A1 13, spokes and gaps

Status: DONE. Suite 1792/1792 (1785 + 7), sweep 0 missing, both run before the commit.

`$2A34CA` (INIT) / `$2A34EE` (STEP), A1 table entry 13, the other half of the pair A4 id6
alternates. With this, **every script A4 id6 arms except MAIN8 is translated.**

## Starting state

W260 committed at `fc5158d`, suite 1785/1785.

## TWO FANS, AND THEY INTERLEAVE

`$A(a4)` steps by 4 under `andi.w #$7`, so it takes 0 and 4 and nothing else, and the two
entries at `$2A3556` are:

    $2A355E   ELEVEN shots: the base, +6 +$C +$12 +$18 +$1E, then -6 -$C -$12 -$18 -$1E
    $2A362A   TEN shots:    +3 +9 +$F +$15 +$1B,       then -3 -9 -$F -$15 -$1B

One is centred on the base and the other straddles it, so consecutive fans fill each
other's gaps. The test asserts that directly: no angle in fan B is any angle fan A used.

`move.w d7,d1` in the middle of each fan is what makes the second half start from the BASE
again rather than continuing from where the first half ended. A port that stepped
continuously would produce a lopsided sweep instead of a symmetric fan.

## BOTH FANS HAVE AN UNREACHABLE TWIN

Each entry point opens with a `bra` straight over an otherwise identical block that fires
through `$281744` instead of `$281708`:

    $2A355E  bra $2A35C6      skipping $2A3562..$2A35C4   (11 sites)
    $2A362A  bra $2A368C      skipping $2A362E..$2A368A   (10 sites)

Nothing in the boss's bank branches, jumps or calls into `$2A3562` or `$2A362E` --
checked by scanning every `bra`/`bcc`/`jsr`/`jmp` in `$2A0000..$2A5000` for either
address. So 21 call sites in this routine cannot run.

That is the sixth vestigial construct in this boss and the largest by far: two whole
alternate fans, each disabled by one instruction. It also explains the shape -- someone
had a `$281744` version and a `$281708` version and chose per fan with a branch.

Those addresses are CODE and so in no ROM window, which means the test cannot read them
either. It asserts the observable consequence instead: 21 shots across the two fans, not
42, and every site one of the `$281708` ones.

## The INIT's ORDER matters twice

    $2A34D0  move.w #$20,$4(a4)    the WORD, so byte $4 is ZERO and byte $5 is $20
    $2A34DC  move.w #$1,$8(a4)     the WORD, so byte $9 is 1...
    $2A34E8  move.b $11(a4),$9(a4) ...and this OVERWRITES it with A4 id6's parameter

The first cost me a prediction: because byte `$4` arrives at zero, `bcc` borrows out of an
old zero and the ARMING FRAME arms the run. And the second is load-bearing -- folding
`$2A34DC` and `$2A34E8` would fire exactly one fan however hard the loop is, since
`$11(a4)` is the low byte of the parameter carrying A4 id6's loop-2 rule.

A4 id6's SECOND parameter (`$12(a4)`, from `$2A1336`) is never read here. Seventh
vestigial construct.

## The window

New: `$2A3556 + 8`, two dispatch longwords. The cursor bound (`$2A3540 addq.w #$4` with
`$2A3544 andi.w #$7`) is what makes it two, and its own first entry is `$2A3556 + 8`, so
the table says where it stops. The conductor's `rts` is at `$2A3554`, one word before it.

## What is left of the Stage-4 boss

    MAIN8  $29FA8A / $29FAAE -- A0 entry 8, and the last of A4 id6's descendants

## Order for the next wave

1. MAIN8. Then the third phase runs end to end the way the second does, and the boss has
   three phases translated with only its later A0 entries (MAIN9 onward) unread.
