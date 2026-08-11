# W285: D17 -- kill a carrier and the medal appears

Status: DONE. Suite 1987/1987 (1984 + 3), sweep 0 missing on both, run before the commit.

One measurement, as the handoff asked for.

## Starting state

W284 committed and pushed at `5ff1c32`, suite 1984/1984, D19 filed.

## THE MEASUREMENT

Boot the laser-hold rung, run forward, find a live type-`$8A` carrier, drive `$276744`'s two
death conditions on it -- a hit bit in the `$5C` mask and the HP SIGN -- and step one frame:

    reserved ten before the kill    0
    reserved ten the NEXT frame     1
    pool A live count               1

**The medal appears.** `deathSeq8A` -> `allocBee27F92A` -> a bee in the reserved ten, inside a
running game, with nothing forced except the two bits that mean "this enemy just died".

So D17's chain is complete end to end on `main`. What was missing was never the port: **no
scenario in the tree kills a carrier.** The same test asserts both halves of that -- carriers
are live on many slot-frames, and no medal ever appears unaided -- so if a future scenario
change makes the second half false, it says so instead of quietly passing.

## AND THE GATE IS THE SIGN, NOT ZERO

`$27674E tst.w / $276752 bmi` reads the HP's SIGN. A port that tested `=== 0` would drop
nothing whenever a hit took HP negative rather than exactly to zero -- which for a laser is the
normal case, not the edge one. Driven the other way to pin it: a hit with HP still positive
produces no medal.

That is the kind of thing that would have looked like "the medals are missing" and been a
one-character bug, so it is worth an assertion even though the port already had it right.

## WHAT THIS DOES AND DOES NOT SETTLE

**Settled:** the medal's producer, allocator, fill and pool accounting all work in a live run
the moment a carrier dies. Combined with W284, the whole of D17's mechanism is proven present.

**Not settled by this wave:** whether the owner's build has it. `bee.js`'s header records the
identical symptom as the report W111 fixed, and D19 exists because nothing tracks which build
a report came from. This session closed six docket items and moved the bundle 4194 -> 4244
streams with **no publish**.

So the honest status for D17 is: **the mechanism is proven, and the next step is a publish and
a second look rather than another translation wave.** That is D19's whole point, and this is
the first item it applies to.

## The one real gap still open in this family

`$280CEE` -- kind 16, the bee's flying variant -- throws, and it throws AFTER claiming a
reserved slot, so a caller that swallowed it would leak one of the ten per attempt. W284 pinned
that. The carrier passes kind 1, so nothing reaches it today.

## Docket status

    D13 W279   D14 W280   D15 W279   D16 W283
    D17 MECHANISM PROVEN (W284, W285). Unreproduced on main because no scenario kills a
        carrier; next step is a publish, not a wave.
    D18 standing rule -- commit AND push every wave
    D19 standing rule -- record the deployed build id with every report

## Order for the next wave

1. **PUBLISH, and ask the owner to look again at D17 and D16.** `node tools/publish.mjs`
   gates on the Batman suite being ALL GREEN with 0 skipped, builds `dist/` and deploys. Six
   docket items have been closed since the last deploy and three of them were things that
   already worked -- so the cheapest next move for the docket is not a translation wave.
   **Regenerate the assets first**: this session added ROM windows, and `export-web.mjs` must
   run before `publish.mjs` or the live site serves a stale bundle.
2. **`$280CEE`**, the kind-16 fill -- a named gap in the `$280Cxx` family W264/W266 know.
3. **`$280BCE`'s finish routines**, which still cap a long run at frame 6482 and are what
   stands between the port and observing the item chain through to a boss part death.
4. Then `$25DEAE`/`$25E0EA` and the nine bonus lines at `$25FF52`.
