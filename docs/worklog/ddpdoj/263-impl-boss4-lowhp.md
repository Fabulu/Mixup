# W263: the low-HP transition, and the third phase becomes REACHABLE

Status: DONE. Suite 1806/1806 (1799 + 7), sweep 0 missing, both run before the commit.

W219 left `$29FE52` a loud throw: "Stage-4 boss low-HP transition is beyond the W219
arrival slice." Every script it arms now exists, so this wave translated it. **The third
phase W258..W262 built is now something the boss actually reaches in play.**

## Starting state

W262 committed at `a9851b1`, suite 1799/1799.

## The table census that came first

W262 asked whether the boss was complete. Two censuses answered it:

- The **A0 table has nine entries**: `$29F498 + 9*8` reads `$102C0002`, which is
  `move.b $2(a4),d0` and not an address. Every `seqStart` in `$29E000..$2A5000` uses ids
  0, 1, 2, 3, 4, 5, 7, 8 -- id 6 is never started.
- The **A4 table has seven**: entry 7 reads `$32190C41`. Every `a4Start` uses ids 0, 1, 3,
  4, 5, 6 -- **id 2 is never started.**

So MAIN5 (`$29F982`), MAIN6 (`$29F998`) and A4 id2 (`$2A051A`) are unreachable in this
build. A4 id2 is the only thing that starts MAIN5, and nothing starts A4 id2. That is what
made the boss's remaining work small rather than three more routines.

What the census DID find was the live edge: `$29FE6C a4Start(6)` sits behind the throw at
`$29FE52`, so my own new third phase had nothing to start it.

## What the transition does

    $29FE52  move.b #$1,$16d(a6)          once
    $29FE58  move.w #$1,$8130F0           ...and see below
    $29FE60  jsr $259B34 / $2598A2        clear every A1 and A4 slot
    $29FE6C  a4Start(6)                   THE THIRD PHASE
    $29FE74  bsr $29FF14                  the left pod blows up
    $29FE78  bsr $29FF94                  the right one
    $29FE7C  jsr $243DD0                  the hit-stop, counted not modelled

**`$8130F0` is the word type `$42`'s handler frees on.** So that one store is the entire
second-phase cleanup: every child still in the air frees itself with an effect on its next
frame (`$2A3B0C`, ported in W256). Parent and children again talking through a single word.

## The pods, one routine twice

`$29FF14` and `$29FF94` are the same code with every offset plus `$20`, A2 object 7 then 8,
and effect table `$29FF6E` then `$29FFEE`. And `$9F(a6)` -- the left pod's latch -- is
exactly the kill switch A1 7 tests first (`$2A2E9E`, ported in W250), so destroying the pod
also retires its attack. One store, two jobs.

`$2A00C0` is a 12-byte-row effect walker terminated by `$FFFF`. Its rows are 10 bytes of
fields and **two the ROM skips** (`$2A0108 addq.w #$2,a1`), and the skipped pair holds
plausible values (`$04A0`, `$0450`, `$0200`) rather than padding. Transcribed as a skip; a
10-byte stride would walk the rows out of alignment. Each row's heading is `$1B(a6)`
DOUBLED TWICE, byte-wide, so the effects fly at four times the boss's own angle.

Both tables already resolved inside the existing `$29FB5A + $52E` window, so no exporter
change was needed.

## A LATENT TRAP IN EVERY BOSS4 TEST FIXTURE

`POOL_B.base` is `0x81b732`, which is the exact address every boss4 test uses for A6. It
has never mattered because none of them spawned pool-B effects. This one does, and the pool
scribbled straight over the sub-record the test was asserting about -- `$16D(a6)` came back
as 30. The fixture now uses an address in the sub-record pool's own range instead, with the
reason written next to it.

Worth knowing before the next test that spawns effects from a hand-built boss.

## The Stage-4 boss is now complete for every reachable path

    phase 1   F0/F3/F4, MAIN0/MAIN1, D0/D9/D10, E1/E2/E3/E5, objects 0..10
    phase 2   F1, MAIN2/MAIN3, F5, MAIN4, A3 3..8, A1 6..10, type $42
    phase 3   A4 id6, MAIN7, MAIN8, A1 11/13/14, type $42's second half
    the edges the damage controller drives, including this transition

Unreachable and deliberately left: A4 id2, MAIN5, MAIN6 (nothing starts them), the
`$281744` twins of A1 13's two fans, type `$42`'s three call-site-less emitters, and
`$2A3AFE` (a role-`$FF` child meeting `$8130F4 == 2`, which no translated path produces).

## Order for the next wave

1. Take the FIRST unfinished item in the handoff's work order rather than more boss
   interior: D11's remaining transition presentation (`$28C186`, `$28D6FC`), then D3/D4,
   then the `$240DC2` sites and D7's gauges.
2. Stage 5 is the next big frontier, and the boss no longer blocks it.
