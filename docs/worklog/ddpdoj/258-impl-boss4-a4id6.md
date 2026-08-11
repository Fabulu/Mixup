# W258: Stage-4 boss A4 id6, the third phase

Status: DONE. Suite 1772/1772 (1762 + 10), run before the commit.

`$2A11D4` (INIT) / `$2A1274` (STEP), A4 table entry 6, which F5's arm 5 hands to. Its
INIT is the phase change itself.

## Starting state

W257 committed at `3cc061a`, suite 1762/1762.

## THE INIT IS THE PHASE CHANGE

`$2A11D4 move.w #$2,$8130F4` is one instruction and it re-routes every type `$42` child
already in the air: W257's two halves branch on exactly that word, so the whole formation
switches behaviour on the next frame without anyone touching the children. Landing W257
first is why this wave is not a regression.

The rest of the INIT retires F5's entire attack set -- A3 4 and A1 6, 7, 8, 9 and 10 --
and starts MAIN8, A3 3 and (via the STEP) A1 11 in their place. A3 5 is deliberately NOT
among the stops, which the test asserts by leaving it running.

## What the test corrected, and it is a nice detail

I predicted the fall-through would start A1 11 on the arming frame. It does not: the same
INIT starts A3 3 eleven instructions earlier, and state 0 (`$2A127E`) waits on A3 3 being
idle. So the phase OPENS with A3 3's animation -- the `$106(A6)` body ramp W247 ported --
and only brings A1 11 in once that finishes. The fall-through is still observable, just as
a refusal rather than a start, and five tests had to be rebuilt around the real sequence.

Also corrected: `$2A1330`/`$2A1336` hand A1 13 its two parameters BEFORE `$2A135C`/
`$2A136A` ratchet them, so the first A1 13 gets the INIT's values and the ratchet is for
whoever comes next. Reversing those two would make the attack open one step too hard.

## `$8130F2` IS A ONE-FRAME PULSE

State 1 holds it down every frame and raises it for exactly one, every `$4(a4)` frames,
then draws the next interval as `$1C0` plus a 7-bit `$242EC2` draw. Type `$42`'s sweep
(`$2A3F2A`) waits on that word, so this pulse is the signal that starts every child's turn
at the same instant. Both halves of it are asserted -- up, then down on the very next
frame -- because a flag left up would make the sweep re-arm continuously.

## The alternation

`$6(a4)` swaps between A1 13 and A1 14, each waiting for the other to finish
(`$2A12D6` and `$2A130E`), and each is handed a parameter THROUGH the slot `$259A18`
returns: `$C(a4)` to A1 14, and `$A(a4)` plus `$E(a4)` to A1 13. That is the second place
in this boss to write through a started slot; F5's arm 6 was the first.

## THE THIRD AND FOURTH LOOP-2 RULES

`$813098` is read twice here, and both reads change the same parameter:

    $2A1250   `$A(a4)` starts at 3 in loop 2 and 1 in loop 1
    $2A1346   ...and its ratchet caps at 5 in loop 2 and 3 in loop 1

So loop 2's version of this attack begins harder AND ends harder. With W241's zero-lives
extend and W250's A1 6 ring, that is four loop-specific rules translated.

## What is left of the Stage-4 boss

    A1 11  $2A317C / $2A31A0 -- A1 9's sibling: one list, and a per-child ROLE byte
                                at $2A31EC, which is what finally feeds W257's fan
    A1 13  $2A34CA / $2A34EE
    A1 14  $2A36EA / $2A3714
    MAIN8  $29FA8A / $29FAAE -- A0 entry 8

All four are unregistered, so a walk that reaches this phase throws by address. That is
the same frontier shape W246 shipped.

## Order for the next wave

1. A1 11, because it is the one that makes W257's aimer-and-fan design do anything: its
   list is where roles `$70`/`$71` and 0..7 come from, and nothing else in the image
   produces them.
2. A1 13 and A1 14, the alternating pair, then MAIN8.
