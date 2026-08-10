# W233: the TX text layer, and what actually blocks D6

Status: RECON BANKED, implementation not started

Opened to port the TX text printers `$240DC2`/`$240EBC`, which the W232
transition measurement showed being counted 60 times per stage transition. The
recon changed the slice, so this worklog banks what was measured instead of
half-implementing on a wrong premise. Resume from here.

## The finding that changes the slice

**`$240DC2` is already ported.** W116 translated the whole TX defer path:
`txDeferGrid` in `src/hud.js` is the printer, `TXDEFER` names its three RAM
addresses, `flushTextDefer141258` is the flush, and `src/isr.js:78` already calls
it from the ISR6-gated slot. The flush's tail `$14123A` is `deferReset` in
`background.js`.

So the sixty counted calls per transition are not a missing subsystem. They are
CALL SITES that still note `$240DC2` as unported, on a premise that stopped being
true two waves before those notes were written. The stale claims are in:

- `src/items.js` (five sites): the SET item's HUD rows, `$252E9A`'s family.
- `src/bee.js:864`: the bee popup descriptor.
- `src/background.js:235` and `src/main.js:176`: comments only.

Each live site needs its own transcription of the caller's register setup (the
`move.w`s into D0-D4 before the `jsr`), which is per-site work, not subsystem
work. That is the correct shape for the next slice.

## D6, fully mapped

The owner's report is that bees can be collected but nothing indicates it. That
is exactly right, and the score is not the problem: the award runs (`$27FC72`
sets bit 0). Two gaps, both in `bee.js`:

1. `$27FC24` -- `lea ($27FD4A,PC),A0 / move.l (A0,D1),($10,A6)`, the popup
   descriptor write. Two instructions. `$27FD4A` is ten longwords (the popup
   ladder, indexed by the same `$817F82` cursor the base ladder uses) and is
   **not in any ROM window** -- it needs one.
2. `$28112C` -- the bee's COLLECTED-ANIMATION arm, which is the popup itself.
   Currently a `note()` in `beeBody27FACC`. Measured, it is bounded:

   - `$28112C` flickers `$1d(a6)` bit 4 on the `$80390C` phase when D1 bit 13 is set.
   - `$281140` drifts the short axis by `$1a(a6)`.
   - `$281148` runs a byte timer at `$14(a6)` reloading from `$15(a6)`; when the
     LIFETIME byte `$19(a6)` reaches zero it jumps to `$2811AE`, which clears the
     slot's first two words and decrements `$817F7E`, the pool census.
   - `$281160`'s `$18(a6)` chooses whether `$16(a6)` is ADDED to or SUBTRACTED
     from the long at `$a(a6)` -- the rise-then-fall of the popup.
   - `$281178` draws through `$23DBCA` with D6 = `$40004000`, which the port
     ALREADY calls as `enqueueZoomedThroughStub(ram, rom, 0x23dbca, a6, 0x40004000)`
     at `bee.js:717`.
   - `$281188` gates the DIGITS on `$14(a6) >= 3`, then `$2811BE` biases D1 by
     `$FDC0`/`$200`, sets D2 = `$20168C`, D3 = `$210`, D4 = `$1D` and calls
     `$23EC20` -- an emitter the port does NOT have yet, and the one real new
     dependency in this slice.
   - `$2811A2` sends the x2 case on to `$28129E`, also unported.

So D6 = one ROM window, two instructions, `$28112C` with its `$2811BE` helper,
`$23EC20`, and the `$28129E` x2 arm. Nothing else.

## Also worth knowing

`$23EC20` is the only genuinely new routine in the list, and it is the same class
as the emitters already in `spritequeue.js` and `bossarrival.js`. W232's lesson
applies: check whether it is a member of a family the port already implements
before writing a new one -- `$23F82A` turned out to be `emitScaled` on bucket 22,
and cost four lines instead of forty.

## State when this was banked

HEAD `ea7ce3c`, suite 1629/1629 green, sprite streams 3979, descriptor sweep
reporting zero unresolvable descriptors.
