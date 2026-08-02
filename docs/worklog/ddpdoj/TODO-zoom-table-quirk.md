# TODO — the DaiOuJou-specific sprite zoom-table value in MAME's IGS023

status: NOT STARTED (recorded so it is not lost)
role: note   raised: 2026-08-01 by the owner

## The lead

MAME's IGS023 video device (`src/mame/igs/igs023_video.cpp`, public source)
reportedly carries a **DaiOuJou-specific comment about an expected value in the
sprite zoom table**. We have not read it: this machine has MAME's BINARY
distribution only, no `src/`.

The owner's framing is the reason this is worth a file: that is exactly the kind
of tiny hardware-shaped peculiarity that produces **"looks correct for six
minutes and then diverges"** bugs — rare enough that a natural corpus never
reaches it, specific enough that when it fires the picture is wrong.

## Why it lands somewhere we already have teeth

`games/ddpdoj/tools/zoomcov.py` exists and its header already records the
general form of this risk, MEASURED rather than argued:

> breaking the zoom loop entirely (`gfxgate.py --mutate zoom-off`) costs only
> **2.7 %** of the pixels over the 16 gameplay pairs, because the game zooms one
> or two small sprites per frame. A gate that green-lights a decoder with a
> broken zoom loop 97 % of the time is not a gate for the zoom loop.

So the renderer's 15,955,968/15,955,968 = 100.0000 % over 159 frames is true and
nearly silent about zoom. `zoomcov` answers that by writing a SYNTHETIC display
list into the game's own sprite list in main RAM at the sample point, letting the
hardware DMA carry it to the chip, and reading coverage back **from the dumped
buffer** — so a poke that silently failed shows as absent coverage, not as green.

Note the encoding subtlety already recorded there, because it is the sort of
thing a "just test all 16 entries" sweep gets wrong: the effective index is
`0x10 - z` when `grow` is set, so **z=0 with grow=1 is the NO-ZOOM encoding**
(`0x10` → `zoom_word()` returns 0), not a zoom.

## What to do

1. Read the comment in `igs023_video.cpp` — public source, no ROM needed. Find
   which table entry it concerns and what value it expects.
2. Determine whether it is a HARDWARE fact (the board really behaves that way)
   or a MAME workaround (an emulation fudge for something not understood). Those
   have opposite consequences for a port: reproduce the first, do NOT bake in the
   second. `docs/knowledge/06`'s rule applies — MAME is authoritative for what
   the game computes, and an unexplained special case is exactly where that
   authority is thinnest.
3. Add that entry to `zoomcov`'s coverage table as a NAMED case rather than one
   of sixteen anonymous combinations, and make it a check that has been seen red.
4. If our decoder disagrees with the expected value, that is a real find and it
   would otherwise have surfaced as a divergence minutes into a long run, in a
   frame nobody was looking at.

## The general lesson, which outlives this entry

An emulator's source comments are a map of **where the hardware is peculiar** —
each one marks a place somebody had to special-case reality. They are cheap to
read and they point straight at the states a natural corpus will not reach. Worth
a systematic pass over the driver's comments for both PGM and, retroactively, the
NES and Game Boy work.
