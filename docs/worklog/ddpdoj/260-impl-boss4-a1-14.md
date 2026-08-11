# W260: Stage-4 boss A1 14, the four-muzzle burst

Status: DONE. Suite 1785/1785 (1778 + 7), sweep 0 missing, both run before the commit.

`$2A36EA` (INIT) / `$2A3714` (STEP), A1 table entry 14, one half of the pair A4 id6's
`$6(a4)` alternates.

## Starting state

W259 committed at `ff81ae1`, suite 1778/1778.

## THREE THINGS RAMP AT ONCE

    $9(a4)   the burst LENGTH, +1 per burst, so each burst is longer than the last
    $E(a4)   a speed bias in D0's high word, +2 per SHOT within a burst
    $10(a4)  the number of bursts -- and this one is A4 id6's PARAMETER, written through
             the slot `$259A18` returned before the scheduler ever dispatched the INIT

`$A(a4)` is a two-bit `$242EC2` draw choosing one of `$2A37CC`'s four muzzle offsets, and
it is redrawn once per BURST rather than per shot, so a whole burst comes from one place.
The test asserts that by checking the muzzle is unchanged across all five shots.

The INIT deliberately does not touch `$10(a4)`, which has its own test: an INIT that
zeroed it would make the attack never end, and that is exactly the kind of thing a port
adds by reflex.

## THE AIM IS STICKY, AND ITS SEED IS $80

`$2A3764 jsr $24226E` is followed by `bcs $2A3772`, which SKIPS the store. So a burst
beginning with no live target keeps whatever `$C(a4)` already held.

The seed is where I was wrong. `$2A3708 move.w #$8000,$C(a4)` writes a WORD, and the
heading is the byte at `$C` -- the HIGH half -- so it seeds `$80`, not 0. A targetless
burst therefore fires straight back the way it came rather than straight ahead. The test
asserts `$80` in both the counter and the spawned bullet's direction, so neither a
carry-stores-anyway port nor a reads-the-low-byte port passes.

## The window

New: `$2A37CC + $10`, four muzzle offsets bounded by `$2A373A andi.w #$3`, ending at
`$2A37DC` -- which is type `$41`'s init stub and the first byte of W223's window. The two
are exactly adjacent with nothing between them, and the test asserts both halves of that.

Two muzzles are on each side: the short axis reads `$E00`, `$1400`, then `$F200`, `$EC00`.

## The old-zero borrow, for the fifth wave running

`$4(a4)` arrives at 4 and `bcc` borrows out of an old zero, so the first burst arms on the
FIFTH frame and not the fourth. Three of this file's tests had it wrong the same way. It
is now the single most reliable source of corrected predictions in this port, which is the
argument for writing the frame number into the test rather than a range.

Also corrected: forcing the inner cadence in the same loop that arms a burst spends one
of the burst on the arming frame, so the observed lengths are 4, 5, 6 where the values
written are 5, 6, 7.

## What is left of the Stage-4 boss

    A1 13  $2A34CA / $2A34EE  -- a small conductor and TWO fan bodies behind a
                                  two-entry dispatch at $2A3556:
                                  $2A355E is 28 shots ($281708 x11, $281744 x17)
                                  $2A362A is 14 shots ($281708 x10, $281744 x4)
    MAIN8  $29FA8A / $29FAAE  -- A0 entry 8

A1 13's conductor is only `$8A` bytes and ends at its own `rts`; the work is the 42
individual call sites, each with its own angle step, which is a transcription wave of its
own rather than a tail end.

## Order for the next wave

1. A1 13's conductor plus its two fans, enumerating every call site's angle delta out of
   the image rather than by eye.
2. MAIN8, and the third phase then runs end to end the way the second does.
