# W284: D17 -- the medal chain works, and the deploy is the thing nobody is tracking

Status: DONE. Suite 1984/1984 (1977 + 7), sweep 0 missing on both, run before the commit.

W283's method, applied to the medals: count the script, count the run, look at a draw only if
they disagree. They disagree, and the reason is not in the port.

## Starting state

W283 committed and pushed at `a6daa7b`, suite 1977/1977, D16 closed.

## THE MEASUREMENTS, IN THE ORDER THE METHOD PRESCRIBES

    the SCRIPT   stage 1 holds TEN type-$8A records. The carrier is not rare -- ten,
                 against the two type-$85s that made D16's answer a count.
    the RUN      all TEN spawn. Measured over 6400 frames from the laser-hold rung by
                 walking the 58-slot enemy table and counting type transitions; the
                 census also reproduces the two $85s exactly, so the walk is sound.
    the POOL     the RESERVED TEN -- the slots ONLY the carrier's death arm allocates
                 from -- is NEVER occupied. Pool A itself is busy (11 live at peak,
                 non-zero on 4623 of 6400 frames), so the pool works; the bee's ten
                 do not get used.
    the WIRE     `deathSeq8A` is complete and calls `allocBee27F92A` at `$2767E6`,
                 with the kind from `($1A,A5)` and the layer from `($1F,A6)`.

So ten carriers spawn, the wire exists, and no medal is ever allocated. **The carriers are
not dying.** The laser-hold ladder parks the ship at the bottom horizontal centre and holds
Button 1 for the whole stage -- by design, it is W75's scenario for reaching the mid boss --
so it kills what flies into the beam and nothing else. A carrier crossing the screen away
from the centre line is never shot.

That is a property of the SCENARIO, not of the port.

## FORCED BY HAND, THE CHAIN WORKS -- AND ONE HALF OF IT DOES NOT

    kind 1  ($04)   allocates one reserved slot, live count 1, ZERO counted notes
    kind 16 ($40)   allocates the slot and then THROWS `Unreached $280CEE`

Kind 1 is what a real carrier death passes (`$2767DE` moves `$0004`), so the medal path is
complete. **Kind 16 -- the bee's flying variant -- reaches an untranslated fill at
`$280CEE`**, which is a real named gap in the `$280Cxx` impact-template family W264 and W266
worked in.

And it throws AFTER claiming the slot, which is worth knowing on its own: a caller that
swallowed the throw would leak one of the ten reserved slots per attempt. Asserted.

## THE FINDING THAT MATTERS MORE THAN ANY OF THAT

`src/bee.js`'s own header, written at W111:

> The owner is playing the live build and the yellow 500-pt medals the carrier type-$8A
> drops are nowhere: they never spawn, never fly, never get collected, never score.

**That is D17's symptom, verbatim, and W111 ported the whole lifecycle to fix it.** So D17 is
plausibly a RE-REPORT of an already-fixed defect, seen on a deploy that predates the fix.

Which exposes something the docket has no way to express: **every entry records what the owner
saw, and none records WHICH BUILD they saw it on.** This session alone has:

* taken the sprite bundle from 4194 streams to 4244,
* added seven ROM windows,
* and fixed D7, D8, D13, D14, D15 and D16,

with **no publish**. `tools/publish.mjs` is a separate action from `git push` -- W279's D18
entry says so explicitly -- and nothing in this session ran it. So the live build is at best
one session stale, and the owner's reports are being taken against it while every measurement
here is taken against `main`.

Three of this session's docket items -- D7, D8 and D16 -- turned out to be things that already
worked. That is now a pattern with an obvious candidate explanation, and the fix is process
that costs one line per report: **record the deployed build id beside the symptom.** The page
already stamps one (`src/buildid.js`, and `assets/manifest.json` carries `buildId`), so the
owner can read it off the page they are playing.

Filed as **D19**.

## What this does NOT claim

It does not claim the medals work on the board, and it does not claim D17 is invalid. It
claims the port's medal chain is complete for kind 1, that no scenario in the tree kills a
carrier, and that the symptom matches one W111 already fixed. **The way to settle it is to
kill a carrier** -- either a scenario that sweeps rather than parks, or a forced HP zero -- and
that is the next wave's first move, not a conclusion this one is entitled to.

## Docket status

    D13 W279   D14 W280   D15 W279   D16 W283
    D17 the chain is proven complete for kind 1; kind 16 throws at $280CEE; no scenario
        in the tree kills a carrier, so the symptom is unreproduced HERE
    D18 standing rule -- commit AND push every wave
    D19 NEW -- record the deployed build id with every docket report

## Order for the next wave

1. **KILL A CARRIER.** A scenario that sweeps horizontally instead of parking, or a forced
   HP zero on a live type-`$8A`. That settles D17 either way, and it is one measurement.
2. **`$280CEE`**, the kind-16 fill. It is a named gap in a family two waves already know
   (`$280BCE`'s dispatch, `$280E4A`'s templates), so it should be cheap.
3. **D19**: ask for the build id with the next report, and put a line for it in the docket's
   header so it is not forgotten.
4. Then `$280BCE`'s finish routines -- still what caps a long run at frame 6482 -- and the
   nine bonus lines at `$25FF52`.
