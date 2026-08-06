# OWNER NOTE - the visible bees may be a MISSING COVER SPRITE

owner, 2026-08-06. Not a wave. Recorded so the next bee wave starts from it.

> "As for visible bees, I think the sprite of the thing covering them was
> missing. If we draw that we should be gucchi."

## WHY THIS DESERVES A MEASUREMENT RATHER THAN A DISMISSAL

The earlier bee round (`70` to `73`) settled two things and left this one open.

**Settled:** destructible cover of the DonPachi (1995) kind is **not** in this
game, and the flicker the owner first reported is the **carrier**, enemy type
`$8A`, HP 10, emitting on alternate frames. That is authentic and correctly
ported. The known DEFECT there is an omission: pool A's driver `$27F95A` is
unported, so killing a carrier yields no bee.

**Not settled, and this note is about it:** why bees are VISIBLE in our port at
times the owner says they should not be. Recon 73 answered "what reveals a bee"
(the laser tip). It did not enumerate what DRAWS OVER a bee's position on the
frames where the board shows nothing.

Those are different questions, and the owner's theory is the second one.

**The prior strongly favours the owner here.** Note that in the bee round the
owner's "shoot the cover off" instinct was closer to the truth than one of the
three web recons. And in the last four waves, THREE separate visual defects on
this project turned out to be missing ART rather than wrong logic:

- W81: the fighter and the mech drew nothing because their streams were never
  exported.
- W84: 186 records had no picture because the exporter's own comment claimed
  those longs "only look like stream starts". They were art; the board draws 54
  of them.
- W75: the black terrain and an invisible enemy are ONE object, a hitbox
  lattice on a gold crystal drawn by bucket 2/3 elements.

"A sprite that should be on top is missing, so something behind it shows
through" is the same shape as all three.

## OWNER CORRECTION, SAME DAY - HALF OF THIS WAS NEVER AN OPEN QUESTION

> "Nothing covers the bees yet, we haven't implemented that yet."

The owner is right and the framing above was sloppy. This note originally read
as though it were uncertain whether OUR PORT draws a cover. It does not, and
that is not in doubt: nothing in `games/ddpdoj/src/` implements one, and recon
73 already recorded that the port draws the CARRIER and never the pickup.

So there are two questions and only one of them is open:

- **Does our port draw a cover? NO, and it never has.** Settled, by the owner
  and by the source. Do not spend a wave establishing it.
- **What IS the cover, where does its art live, and what spawns it?** Open.
  This is the whole job.

The measurement below is therefore not a test of whether something is missing.
It is the fastest way to find out WHAT is missing, by asking the board what it
draws at those coordinates on those frames. Frame it that way in the brief, or
the wave will waste its first hours confirming something the owner already told
us.

## WHY IT IS CHEAP TO FIND IT NOW, WHERE IT WAS NOT BEFORE

Two tools landed since the bee round:

- **`boarddl.mjs`** (W75) reads the BOARD's own display list off a checkpoint
  ladder. It answers "what does the cartridge actually draw on this frame".
- **W85's bucket 2 trace**: 20,785 bucket 2 records now compared against the
  board over 6,750 frames, 0 missing, with nine of W82's twelve mutations
  proven to go red there.

So the experiment is direct: **take the frames where a bee is visible in our
port, ask the board what it draws at those coordinates, and diff.** The owner's
theory predicts a record in the board's list, at or over the bee's position,
that our port does not emit. If it is there, the fix is the same shape as W81
and W84: find the table, harvest it, emit it.

**If it is NOT there**, that is equally valuable and must be reported as such.
It would mean the bees are visible for a different reason (a Z order or bucket
priority difference, a missing occluder in the BACKGROUND rather than the
sprite list, or the port spawning bees the board does not spawn at all), and
the next wave should not go looking for art.

## SEQUENCING

Behind the current wave (`$274AF0` and the black terrain) and behind the boss.
Pair it with the known `$27F95A` omission so one wave owns the bees end to end:
make a killed carrier yield a bee, make the cover draw, and make the bee score.

**Rank is the reason this is not cosmetic.** Bees feed rank two indirections
deep: hit gauge 3% per 20 hits capping at 30%, yielding a hyper item, raising
hyper stock, and `$81B646` accumulates and permanently adds 16 to rank at the
next super. `20-OWNER-scoring-must-be-exact.md` governs, so a bee that is
visible when it should not be is a symptom worth chasing to its cause rather
than hiding.
