# W225: Stage-4 boss F5 arrival attack

Status: PAUSED

Paused deliberately, with no code written, because the owner opened
[../../DOCKET.md](../../DOCKET.md) with player-visible defects in stages the
player actually reaches. Those outrank a Stage-4 boss interior. The number stays
spent and this file stays the F5 slice; resume it from the recon below.

## Scope

Translate A4/F5 `$2A0CF6/$2A0D16`, which MAIN3 starts once the W224 damage
transition reaches its target, and follow its live scheduler descendants to the
next genuine frontier.

## Starting state

- W224 is committed at `6d19202`.
- The damaged body is live: objects 9/7/8 draw, MAIN3 walks the boss to
  `$6000` / `$1C00 - $813172`, and on arrival it stops the sequencer and starts
  A4 id5, which is not yet translated.

## Recon already done (do not repeat)

- A4 `$2A0088` id5 is `$2A0CF6` (INIT) / `$2A0D16` (STEP); id6 `$2A11D4` is the
  next entry, so F5's body and its data end before it.
- INIT is short: `seqStart2598D0(4)`, then byte state `$2(A4)` = 1, `$3(A4)` = 0,
  words `$4(A4)` and `$6(A4)` = 0. So MAIN4 `$29F8CC/$29F8F0` (A0 entry 4) comes
  with it and is the next MAIN to translate.
- STEP is a state machine on the BITS of `$2(A4)` and `$3(A4)`, not on a byte
  value, and it opens the two linked pods outward: it steps `$6(A4)` by 4 and
  moves `$18E(A6)` down and `$192(A6)` up by that amount until `$192(A6)`
  reaches `$0E00`, then latches `$192`=`$0E00`, `$18E`=`$F200`, clears bit 0 and
  sets bits 1 and 2.
- Those are the same part-offset words `placeBoss4Parts29F50E` already adds into
  the linked parts at `$82`/`$A2`, so the pods visibly spread.
- It then aims each pod with `$241D34` from a `$242B3C` byte, choosing the sign
  by comparing the pod's own `$82`/`$A2` against `$5A00`/`$6400`, and stores the
  results in `$198(A6)` and `$19A(A6)`.
- The `$3(A4)` bits gate A3 scripts 5 (`$2A1506`) and 7 (`$2A1562`) and A1
  script 8 through `$2599B4` running-checks, so those three are F5's
  descendants and the rest of this slice.
- F5 is NOT registered yet, so MAIN3 reaching its target is still an honest
  `Unreached` at `$2A0CF6`.
