# W312: `$280BCE`'s hooks 2, 3 and 17 -- eighteen of twenty

Status: DONE. Suite 2271/2271 (2258 + 13), no skips. Sweep 0 missing on both.

`$280BCE` goes from fifteen of twenty translated to **eighteen**, and the two that remain are
named: indices 1 and 16, which are both `$280CEE` and belong to `allocBee27F92A` rather than to
this dispatch. It will never translate them.

## Starting state

W311 committed and pushed at `71db692`, suite 2258/2258.

## A NOTE ON WHAT I STOPPED DOING

I began this wave on `$28F7F4`, the name-entry panel, and stopped after reading it: it draws
through `$23E45A`, which is a THIRD emitter convention (`movem.l D4/D7/A0,-(A7) / lea
($23E78C,PC),A0`, taking D6) that `resolveEmitStub` does not cover and that sits outside the
emit-stub ROM window. Porting it is a new family, not a transcription, and it would have opened a
counted gap instead of closing one. The finish hooks were on my own work order and use a family
the port has fifteen of, so the effort went there. `$28F7F4` is recorded for whoever does the
zooming emitter.

## HOOKS 2 AND 3 ARE THE SAME TWENTY-FOUR BYTES TWICE

    $280CF8 = $280D10 = 2E004EB900242E240240001FD12800184268002020074E75

    move.l D0,D7 / jsr $242E24 / andi.w #$1F,D0 / add.b D0,($18,A0)
    clr.w ($20,A0) / move.l D7,D0 / rts

That is the **fourth duplicate in this one dispatch**, and the first of a new sort. W286's kind 16
shared kind 1's *table entry*; W298's indices 5, 6 and 7 were all the same *entry* `$280D34`.
These two are duplicated **code** at two different addresses, and the dispatch really does point
at both. Same lesson, different mechanism, and the test asserts both the byte-identity and the
two distinct pointers so the distinction survives.

`move.l D0,D7` / `move.l D7,D0` around the draw is there because the hook must not clobber D0 --
`$280B3E`'s caller still wants the kind. In the port D0 is a parameter, so the save is structural
rather than something to reproduce.

## AND THEY ARE WHY THE FILL STOPPED HOISTING THE SPEED WORK

**Hooks 2 and 3 do none of the shared speed and angle work.** No `$420`, no hook-offset add, no
`bsr $280C84`, no spread, no velocity -- just a random 0..31 added to the BYTE at `($18,A0)` and
the waypoint's first word cleared.

I checked where that work actually lives rather than assuming, and `$280B3E`'s tail is only the
dispatch:

    280b96  lea ($280BB6,PC),A1 / adda.w D2,A1 / move.l (A1),($28,A0)    the layer emitter
    280ba2  lea ($280BCE,PC),A1 / adda.w D0,A1
    280baa  movea.l (A1),A1 / jsr (A1)                                   THE HOOK
    280bae  movea.l (A7)+,A1 / movem.l (A7)+,D7/A0 / rts

So all of it belongs to the hooks. The port had hoisted it into `fillGeneralImpact280B3E` because
all fifteen translated kinds happened to do it -- a reasonable simplification that these two
falsify. It is now gated on `sharedSpeedBody`, defaulting to true so no previously translated kind
changes, and a test drives kind 0 to prove the gate did not turn it off for everybody.

## HOOK 17 IS ONE TABLE ROW

`$280DBA` sets `($1A,A0) = $420`, draws `$242EC2 & $E`, indexes **W287's hook block 1**
(`$280C1E`), adds the word into the sprite long, `bsr $280C84`, and then normalises the status to
`$14` with the same `andi.w #$FF83 / ori.w` the two already-ported kinds use. Every one of those is
something the port already does, so the whole hook is:

    0x44: { hooks: 0x280c1e, status: 0x14, site: 0x280dba }

No new ROM window: `$280C1E + $10` has been there since W287. The `move.w #$420` it writes is the
same redundancy W298 found in `$280CD4` -- the shared fill already writes it -- and that is pinned
so nobody tidies the duplicate away.

## THE SWEEP TEST

The strongest assertion in the file drives **all twenty indices** and requires exactly two to
throw. That catches a table row typed as the wrong index, which none of the per-kind tests would.

## Two test-fixture errors worth recording

The pool base is `$8171BE`, not `$817F80` -- I had written the live-count address plus two. And my
first draft asserted the two kinds' blink words were equal; they are not, because
`impactTemplate280B4A(rom, kind)` gives each kind its own template out of the cartridge. The test
now asserts the shared BEHAVIOUR and that the per-kind DATA differs, which is the stronger pair.

## Changes

* `src/bee.js`: kinds `$08`, `$0C` and `$44` in `IMPACT_FINISH`; `sharedSpeedBody` and
  `jitterBlink` on the spec; the gated block; `drawByte242E24` imported; the throw message
  rewritten to EIGHTEEN and to name what is left.
* `tests/w312finishhooks.test.js`, 13 assertions.
* `tests/w264impact.test.js` and `tests/integration.test.js`: three assertions moved from kind
  `$08` (now translated) to `$04`, which is index 1 and will stay unported.

## Order for the next wave

1. **`$280252`** -- the last blocked item, and still blocked on measuring A0 at `$28029A` (W288).
   A register feeding arithmetic, per W294's rule, so it needs the capture rather than a reading.
2. `$23E45A`, the third emitter convention (`movem.l D4/D7/A0`, its own table at `$23E78C`, takes
   D6 as a scale pair). It gates `$28F7F4`, the name-entry panel, and `$28FAF4`. It also needs the
   emit-stub window widened past `$23E0C2`, so it is a real wave rather than a transcription.
3. `$280BCE` is DONE at eighteen of twenty; indices 1 and 16 belong to `allocBee27F92A`.
4. The four other announcement-poster caller regions, then D11's remainder -- the anim tier,
   reached from four directions now.
5. Stage 5 and both loops.
