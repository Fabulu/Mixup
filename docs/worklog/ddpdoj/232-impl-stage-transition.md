# W232: the stage transition, diagnosed, and its banner picture

Status: COMPLETE

## Scope

Docket D11: the owner's stage transition is abrupt, the ground goes, the ship
disappears and reappears in the new level, and the real game runs a big sequence
there. Find out what is actually missing, then land the largest piece of it.

## Starting state

- W231 is committed at `b5949ba` and the suite is green at 1625.
- D11's standing lead was that object dispatch entries `[4]` `$260B30` and `[11]`
  `$25DBB4` are unported and run every frame.

## What the transition actually does, measured

Forced `$242952` from `rip/web/seed.bin` and stepped 400 frames. The stage machine
itself WORKS: the type-6 object appears, `$812972` (clearing) goes to 1, the stage
word steps 0 to 1, the player parks at `$C00`/`$E00`, and the object retires. What
is missing is the whole PRESENTATION, and every piece of it was already counted by
address:

- `64 x $23F82A` -- the banner's zooming ENTRY picture.
- `60 x $240DC2` plus one `$240EBC` -- the TX text printers, "a text/sprite
  subsystem no wave has touched".
- `5 x $24150A` -- the banner's per-stage resource installs, plus one more for the
  slide-out.
- `$23C638`, `$246410`, `$28D77C`, `$28DE72`/`$28C186` -- the result screen's
  palette cue, animation-object load, sixteen longwords of palette RAM, and its
  exit handshake.
- `$253794` -- the option-pod teardown.

So D11 is not one missing engine. It is the stage-clear BANNER, the TEXT layer and
the RESULT SCREEN, three presentation tiers, on top of a transition machine that
already runs.

Also settled: `[11]` `$25DBB4` is NOT the transition. Its state 0 picks a
per-player table (`$25D952`/`$25D96C`), arms a `$4B0` timer, and its body watches
`$23C932` and `$803808` and dispatches per player -- it is the credit/start/
continue controller, which is why `$260056` creates it. That correction is in the
docket.

## Delivered

The largest single visible piece: the banner's entry picture.

- `$23F82A` is not a new emitter. It is instruction-for-instruction the fourth
  member of the family `bossarrival.js` already implements as `emitScaled` --
  `$23E78C` on both axes, the same D7 assembly, the same
  `andi.l #$7FF03FF / or.l D6` -- writing `$809274`/`$80AFE0`, which is bucket 22.
  Added to `EMITTER_BUCKET` and exported as `emit23F82A`.
- `bannerDraw28EDC0`'s entry arm now reads its zoom longword at
  `$28EE46 + $81E028*4` and emits, instead of counting the call.
- The zoom table is EIGHT longwords and its extent is pinned by its own cursor:
  `$81E028` is loaded with 7 and counted down to 0. `$8000, $9000, ... $F000` --
  the banner zooms in over eight frames. The `$28EE1E` window was `$40` and
  entry 7 lives at `$28EE62`, so it is `$48` now.
- The five per-stage banner PICTURES at `$28EE1E[i*8]` had never been harvested,
  so the banner could not have drawn even with the emitter in place. They are in
  the bundle now: stream total 3974 to 3979, and the count pins move with it.

## Verification

`node --test games/ddpdoj/tests/w232banner.test.js` -> 4/4: the zoom ramp and its
cursor-pinned extent, `$23F82A` writing byte-for-byte what `emitScaled(22)` writes
and touching no other bucket, all five pictures shipped, and the shipped source no
longer counting the call.

Re-forcing the transition shows the `64 x $23F82A` line gone from the counted
gaps. `node games/ddpdoj/tools/w230descriptorsweep.mjs` still reports zero
unresolvable descriptors. Full suite `node --test games/ddpdoj/tests/` ->
**1625/1625**.

## Next, in order

1. The TX text layer, `$240DC2`/`$240EBC`. It is 60 calls per transition and no
   wave has touched it; it is also what D6's score popup and D7's gauges are
   likely waiting on, so it pays three docket items at once.
2. The result screen: `$28DA58`, `$28D770`, `$28D77C`, `$28DE72`.
3. `[4]` `$260B30`, still unported, still running twice a frame.
