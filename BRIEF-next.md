# BRIEF - what to do next on DoDonPachi DaiOuJou

Written 2026-08-08 by the outgoing orchestrator. **This is the working brief.
`CATCHUP.md` is the orientation, `HANDOVER.md` is the fundamentals, this file is
the queue.**

---

## 1. THE STATE, VERIFIED TODAY RATHER THAN QUOTED

I loaded the live build in Chrome and held fire for twelve seconds. **It works.**

```
[M] live build, held fire 12 s      lf 3,135 reached
[M] asset stop shown                NO
[M] console errors / failed reqs    0 / 0
[M] canvas                          224x448, 241 colours, 97.7% non-black
[M] display list                    dl 107, drawn 102, spr 18/18
[M] records with no art             5, across 3 addresses
[M] palette   1,840 / 2,560 cart    spr 656/1024, bg 1024/1024, tx 160/240
```

Also verified: the live `assets.js` carries the missing-tile fallback, and the
"AN ASSET IS MISSING" stop message is gone from the shipped code. **The crash
the owner hit predates that publish.** No emergency, nothing to salvage.

Elsewhere: **boss coverage 103 ported / 0 unported / 8 dead** (the 8 have no
start site in this build), sound at **1,592 of 1,620 keyons and all 1,720
keyoffs**, **1,351 unit tests**.

---

## 2. THE OWNER'S OPEN REPORTS, IN THEIR WORDS

These are primary evidence. On this project the owner's play reports have been
sharper than the gates repeatedly, including one case where their instinct beat
a web recon.

> "No combo counter yet, and when I hit a bit of stuff the counter towards a
> hyper jumps up a big-ish rectangle, but then it's frozen there. At some point
> I get a hyper and I can use it, but that's not shown on the HUD."

> "I think the cyan rectangle is supposed to smoothly progress instead of
> jumping and show how much you've accumulated"

> "Also, the bomb is still translucent. Old nitpick. I also didn't see any bees
> or medals which we said should be in there."

**Five reports. Probably THREE jobs, and possibly only three root causes:**

| # | report | likely cause | confidence |
|---|---|---|---|
| 1 | no combo counter | HUD picture, TX tiles | medium |
| 2 | gauge jumps then freezes | TX tiles: whole-fill tile present, partial-fill tiles absent | **testable, see below** |
| 3 | hyper stock not shown | HUD picture, TX tiles | medium |
| 4 | bomb translucent | unresolved; three candidates dead, one survivor | low |
| 5 | no bees, no medals | bees: unported driver. medals: never investigated | bees high, medals unknown |

**Items 1, 2 and 3 plausibly collapse into ONE text-tile wave.** Do not brief
them as three.

---

## 3. THE ROOT CAUSE BEHIND THE HUD CLUSTER

**The TX tile sheet holds 159 tiles. The port writes index 49208 (`$c038`).**

The sheet was built from a 161-frame capture. The ported HUD, result screen and
score digit code address tiles that capture never contained. A previous wave
added a fallback so a missing tile degrades to transparent instead of throwing,
which stopped the crash and did not fix the gap.

**The specific, testable prediction for the frozen gauge:** a tile-based bar
renders its leading edge with PARTIAL-FILL tiles. If the whole-fill tile is in
the sheet and the partial ones are not, the bar advances a whole tile at a time
(the owner's "big-ish rectangle" jump) and then **freezes at the first missing
index**. That single mechanism explains the jumpiness, the freeze and the solid
block. **It predicts the gauge freezes at a REPRODUCIBLE fill level.** Check
that before anything else; it is minutes, not a wave.

**A second candidate that may be the same finding.** The fallback fills with
pen 0 on the stated assumption that pen 0 is unused background:

```
const TX_TRANSPARENT_PEN = 0;    // txTile: pen 0 is unused/background
```

**That comment is an assertion, not a measurement.** Comments in this codebase
have lied eleven times. The text palette is only 160 of 240 words
cartridge-sourced, so the rest still comes from the recording and pen 0's
meaning there is not guaranteed. If pen 0 is not transparent in the HUD's bank,
every missing tile draws as a solid coloured block.

**Also distinguish STATE from PICTURE for every HUD item.** `src/hud.js` around
line 105 says the HUD's state is ported and its picture is not, but that comment
predates several HUD waves. Re-measure it. If the gauge's underlying counter
keeps advancing while the drawing is frozen, this is purely an art gap. If the
counter also stops, there is a second defect underneath and the tiles are a red
herring.

**The fix, when confirmed:** scan the port for every text-tile index it actually
writes, shard those, ship them deferred. That is the same shape as the sprite
art waves and it is a wave, not a patch.

---

## 4. WHAT IS RUNNING RIGHT NOW

Check `git log` before starting anything; these may have landed.

- **HUD recon** (read only). Pen 0, the freeze mechanism, state versus picture
  for the chain counter and hyper stock, and the list of TX tile indices the
  port writes.
- **Bees / medals / bomb recon** (read only). Whether medals exist and are
  ported at all, why no bees appear, what the cover is, and which bomb
  translucency candidate survived.
- **Sound wave E, the ICS2115 synth** (writes `games/ddpdoj/src/`).

---

## 5. THE QUEUE, IN ORDER, WITH REASONING

1. **Finish sound to audible.** The command layer is done and validated;
   only the synth and the wiring stand between the owner and hearing the game.
   The 28 remaining SFX keyons (wave C8) are 1.7% completeness and change
   nothing audible, so they come after, not before.
2. **The TX tile sharding wave.** Clears the HUD cluster, probably all three
   reports at once. Start from the recon's index list.
3. **Bees.** Pool A's driver `$27F95A` is unported, so killing a carrier yields
   no bee, which alone may explain seeing none. Pair it with the missing cover
   the owner asked about so one wave owns bees end to end. **Rank-critical**:
   bees feed rank two indirections deep and `20-OWNER-scoring-must-be-exact.md`
   governs.
4. **Medals.** Nobody here has ever looked. May be the item family already
   ported (W61), in which case it is small.
5. **The bomb's translucency.** Three candidates dead, one needs MAME. Lowest
   value of the visual items and the owner calls it a nitpick themselves. **If
   it turns out authentic, change nothing and say so** - the hardware has no
   blender, so translucency was faked by alternate-frame drawing, and
   `src/render/capture.js` is explicit that nobody may "fix" that with half
   alpha.
6. **The static coverage system** (`100-PLAN-static-coverage-system.md`). Built
   for the boss in W102 and it worked; generalising it is the owner's idea and
   the highest-leverage thing on this list. The join runs both ways: static
   minus dynamic names code that has never executed, dynamic minus static proves
   the enumerator is not lying.
7. **`$29540C` and the red gate.** The owner mandated porting it believing it
   would clear `STAGE 1 ENDS`. **Measurement afterwards showed it will not**, and
   it is 21 entry points and ~701 instructions. **That decision needs re-putting
   to them, not executing.**

---

## 6. RULES THAT ARE NOT NEGOTIABLE

- **Tell every agent to CHECK ITS BRIEF'S PREMISE.** 47 briefs here have rested
  on something false. Highest-value instruction available.
- **Every check must be SEEN TO FAIL.** Revert, watch red, restore. Twelve
  agents in four days reported one of their own checks unable to fail; all were
  right to.
- **Do not invent behaviour.** Broken and declared beats fabricated. Do not clamp
  an index to stop a throw.
- **REGENERATE ASSETS BEFORE PUBLISHING.** If a wave adds ROM windows to
  `export-tables.py`, run `export-web.mjs` **before** `publish.mjs` or the site
  serves stale assets. This bit the owner and they were rightly annoyed.
- **`PUBLISH_VERBATIM` has six enumerated exceptions.** A seventh is an OWNER
  DECISION: write it up and stop. Sound samples are cartridge audio and are a
  likely candidate.
- **Never `git add -A`. Never commit ROM-derived data.** Private index, one shell
  call, stage by name, commit AND push.
- **`pgm.py check` means `tools/oracle/pgm.py`.** The other one exits 0 silently.
- **Read a gate file's own header before classifying its red.** Some carry a
  board column, some are port versus listing. That distinction decided an owner
  question this week.
- **No em dashes.** Asked twice.
