# W250: Stage-4 boss A1 6 and A1 7

Status: DONE. Suite 1710/1710 (1702 + 8), run before the commit.

`$2A2D70`/`$2A2D8E` and `$2A2E8C`/`$2A2E9E`, the pair F5's arm 4 starts and stops
together. Neither needed a new helper.

## Starting state

W249 committed at `93d43ae`, suite 1702/1702.

## The order changed, and the measurement is why

W249 said type `$42` was next, on the argument that it unblocks A1 9's rendezvous and
therefore F5's cycle. Sizing it first changed that: type `$42`'s handler runs from
`$2A3AF6` past `$2A4080` and is still going, roughly 2 KB, it is MULTI-ROLE (`$3C(a6)`
selects among values 0..3 and `$70`/`$71`), and it writes globals `$8130E4`/`$8130E5`
that nothing else in the port touches. That is a dedicated wave, not a tail-end one.

Its body is small and bounded (`$2A394A` is a two-instruction runLen stub, the real body
is `$2A3952..$2A3A69`, prototype at `$2A3A6A`) but a body without its handler advances
nothing, so it stays with the handler.

Meanwhile A1 6 and A1 7 were bounded, independent of type `$42`, and finish two more of
F5's arms. Doing them first means type `$42` completes the whole phase when it lands.

## A1 6 -- THE SECOND LOOP-SPECIFIC RULE THIS PORT HAS TRANSLATED

`$813098` is the loop word (already `LOOP` in `boss2attacks.js`, and read by boss 2 and
boss 3), and A1 6 branches on it to change both the shot count and the GENERATOR:

    loop 1   three shots through $2817B8, $55 apart   -- a wide three-way
    loop 2   FOUR shots through $281708, $40 apart    -- a full ring

Both barrels, one per pod. W241's zero-lives extend was the first loop-2 rule the port
had; this is the second, and the first that changes an attack rather than a life count.

The two pods counter-rotate: `$10(a4)` loses 4 and `$11(a4)` gains 4 after every volley,
and then AGAIN on every seventh (`$6(a4)`, period 6, old-zero borrow). Two rates rather
than one bigger step, which is what stops the pattern repeating. The test walks eight
volleys and asserts the delta sequence `4 4 4 4 4 4 8 4`.

## A1 7 -- the aimed fan, and the one place the aim is USED

`$24226E` (`aim256FromCaller`) comes back in D1 and the fan is built on it: `base`, `+6`,
`+$C`, `-6`, `-$C`, reached by `+6 +6 -$12 -6` rather than by absolute offsets. That is
exactly `fireFive`'s shape with a delta of 6. A1 8 makes the same call and overwrites the
answer one instruction later; this one does not, and the two had to be told apart.

On a carry (no live target) the ROM leaves D1 holding the biased self-X it computed
before the call, so the base becomes that low byte. E3 already models this convention;
the test drives it with no live player and asserts `$40`, which is `$2000 + $FE40`.

Two more details the test pins:

- `$2A2E8C` writes `$1020` and `$2A2E92` then adds `$40` to the LOW BYTE, so the counter
  starts at `$50`. Folding those two instructions would fire `$40` frames early.
- `$2A2F08` uses `bne`, not `bcc`, and when it fires it rewrites the cadence from `$20`
  to `$40`. The burst gets SLOWER as it goes, which is the opposite of the obvious
  reading.
- `$9F(a6)` is a kill switch checked before anything else: nonzero and the script
  retires without firing and without even touching its cadence counter.

## What is still missing

    A1 10  $2A320E / $2A323E
    MAIN7  (A0 entry 7)
    type $42  init $2A394A (body $2A3952, prototype $2A3A6A) / handler $2A3AF6, ~2 KB

## Order for the next wave

1. A1 10 and MAIN7, the last two of F5's own descendants.
2. Type `$42`, on its own, body and handler together. Landmarks already found:
   `$2A3D5A` is the parent-counter increment A1 9's rendezvous waits on, `$286096` is
   the shared DAMAGE, `$289004` the fire-gen, `$263762` the free, and `$3C(a6)` is the
   role selector that decides which of its behaviours runs.
