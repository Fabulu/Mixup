# W255: type $42's handler, its dependencies landed and its body specified

Status: DEPENDENCIES DONE, handler specified. Suite 1738/1738 (1732 + 6), run before
the commit.

The handler was read end to end this wave. Everything it needs that is not the handler
itself is now in the port, and the transcription has no unknowns left.

## Starting state

W254 committed at `3c5c688`, suite 1732/1732.

## THE HANDLER'S EXTENT, MEASURED

`$2A3AF6` to `$2A4250` (its `rts`), `$75A` bytes. `$2A4252` is the first byte of data,
one word later, with nothing between them.

## TWO BOUNDS THAT CUT IT ROUGHLY IN HALF

W253 found the first (only role `$FF` is reachable from F5). This wave found the second,
and it is bigger.

`$8130F4` gates three large regions (`$2A3AF6`, `$2A3E16`, `$2A3E92`) on the value **2**.
The writers of that word, over the whole image:

    A1 9's INIT   $2A3098   clr.w                 -> 0
    A1 9's retire $2A3126   move.w #$1            -> 1
    A4 id6        $2A11D4   move.w #$2            -> 2

So while F5's phase runs, `$8130F4` is 0 or 1 and **never 2**. Everything from `$2A3E1E`
to `$2A4115` -- about `$300` bytes, including both `$8130E4`/`$8130E5` writes and three
of the four shot emitters -- is skipped for every child A1 9 spawns. It becomes reachable
when A4 id6 lands, which is why the gate must be transcribed as an `unreached()` rather
than dropped: if A4 id6 ever sets that 2, the port must stop loudly.

The reachable path is therefore about `$450` bytes: the damage/kill block, the offscreen
free, the movement and homing, the `$1F(a6)` arrival latch with THE PARENT COUNTER, the
`$3A(a5)` mode-1 section, and the draw tail.

## THE MODE FLIP IS THE PARENT FINISHING

`$2A3DE6 cmpi.w #$1,$8130F4 / bne` is what sets `$3A(a5) = 1`, and `$8130F4` becomes 1
exactly when **A1 9 retires** (`$2A3126`). So a child's second behaviour is triggered by
its own parent's completion, through the same word. That closes a loop the two routines
share and neither documents.

## Landed this wave

**`$241E34`** -> `applyShotVelocity241E34` in `movement.js`. It is `$2417DE`'s shot-side
twin: same shape, same freeze gate, but it calls `$241D34` rather than `$241812` AND it
takes the WHOLE heading byte rather than `& $3F`. Those two compound -- handing this
routine's heading to `$241812` puts the shot in a different quadrant, not merely at a
different angle -- so the test drives heading `$A0` and asserts it does NOT match `$20`.
The freeze arm returns `{0,0}` and does NOT apply, which is also asserted by position.

**`$2A4252 + $82`**, both handler tables as one window, each end pinned by code:

- `$2A4252`, EIGHT sprite descriptors bounded by `$2A41F0 addq.w #$4` with
  `$2A41F4 andi.w #$1F`. They step uniformly by `$64` (`$E8458` ... `$E8714`), so the run
  is its own witness, and `$2A4252 + $20` is exactly where the ladder begins.
- `$2A4272`, the distance-to-speed ladder `$2A3CC2` walks until `$FFFF`: 24 word pairs,
  distance `$40*n` mapping to speed `2n` (the first rung is 1, not 2), terminator at
  `$2A42D2`. A linear ramp, so a child closes faster the further out it is.

**`$23F7C6` needed a WINDOW AND NOT A LINE OF CODE.** `resolveEmitStub` decodes an emit
stub straight out of the ROM, so making it readable was the whole job: it resolves to
bucket 22, register convention, the same `$809274`/`$80AFE0` the stage-clear banner uses.
Its sibling `$23DF2A`, which the port already reaches, is bucket 2 -- so the two are not
interchangeable. That is the twenty-first positive availability check this session and the
cheapest of them.

## The complete call inventory, all resolved

Thirteen absolute calls in the handler. Twelve were already in the port:

    $241D34  shotVector          $286096  DAMAGE
    $2422A2  aim256 core         $28615E  the KILL score
    $24249A  dist242494          $289004  the fire-gen allocator
    $242684  the onscreen test   $28C25A  a sound post
    $263762  freeEnemy           $2816F6 / $281708 / $281764  three generators

and the thirteenth was `$241E34`, above.

## Why the handler itself is not in this commit

Same call W253 made and for the same reason, now with a much sharper estimate: `$450`
reachable bytes of dense transcription with five independent byte cadences
(`$4C`/`$4E`/`$58`/`$5E`/`$74`/`$88`/`$8A`/`$8E`), two `$3A(a5)` modes, and a `neg.b`
oscillator. Every wave this session had at least one frame-count prediction corrected by
its own test; this routine has more counters than any of them. It gets written against a
fresh budget with the inventory above, which is now complete.

## Order for the next wave

1. Transcribe `$2A3AF6..$2A4250` for `$8130F4` in {0, 1}, with `unreached()` on the `== 2`
   gate naming A4 id6, and `unreached()` by role on 0..7 and `$70`/`$71` naming A1 11.
   Register it in `handlers.js` beside `handler41` at `$2A3840`.
2. Then close the loop end to end in one test: F5 arm 6 starts A1 9, A1 9 spawns a
   formation, each child homes and dies into `$19E(a6)`, A1 9 retires and flips every
   surviving child into mode 1, and arm 7 hands F5's cycle back to bit 2. That is the
   first time the Stage-4 boss's second phase runs as a phase.
