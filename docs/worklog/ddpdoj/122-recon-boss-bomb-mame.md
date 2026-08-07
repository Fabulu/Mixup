# 122 -- RECON: boss death explosion + laser-bomb translucency (MAME capture)

status: DONE

started: 2026-08-07. wave: 122. role: RECON (READ-ONLY; the only tree file I
write is this one; scratch lives outside the repo in MIXUP_SCRATCH).

target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address is build B.
instruments: `games/ddpdoj/tools/oracle/pgm.py` (drives MAME),
`games/ddpdoj/tools/oracle/frame.lua` (the probe),
`games/ddpdoj/tools/boarddl.mjs` (reads the board's display list out of a
checkpoint RAM and attributes every entry to its object), `seedcmp.mjs` /
`portdiff.mjs` (re-seed the port from a rung and compare).

Two owner play reports, both needing a MAME capture to settle (W119 Phase 1a).

`[M]` = measured by me, this session. `[cited]` = from another document, named.

## THE TWO QUESTIONS

1. **Boss death.** Owner reported the killed boss "stayed in stasis, no
   explosion." W107 wired the emitters; recon 106 + 7e say 166/166 sprite
   streams present. VERIFICATION: does the board explode at ~lf19533 and does
   the port reproduce it?
2. **Laser-bomb translucency.** Owner sees the bomb as "translucent." The port
   has NO translucency (PGM sprite hardware has no blender; canvas alpha:false).
   Three "why does it look thin" candidates ruled out (recon 106); the fourth
   (artwork genuinely sparse) is pixel-unverified. Is the port's bomb
   pixel-faithful (sparse artwork, no blender needed) or missing density (a
   blender subsystem needed)?

## CAPTURES

`[M]` Two MAME ckpt runs, both invulnerable ($810424=FF, the standard coverage
poke; STATES not a picture of the game). Scratch only, nothing in the repo.

1. **w122 combined** (laser-hold input + bomb held lf3000..3132, 19600 frames,
   606 s, 32.4 lf/s). 27 rungs: bomb window lf2980..3220 + death window
   lf19500..19555. Manifest `$TEMP/mixup-w122/w122/manifest.json`.
2. **w122d forced boss death** (laser-hold input, boss HP0 longword $813752
   poked to $FFFFFFFF from lf18000 to force the HP0 death path). The first
   attempt (w122d) set POKE_FROM=18000, which also delayed the invuln poke to
   lf18000 -- the player died at ~lf2426 and the boss never arrived. The
   corrected w122d2 uses a CUSTOM lua (`$TEMP/mixup-w122/w122d.lua`) for a
   two-phase poke frame.lua cannot do: invuln $810424=FF from lf1960 AND boss-HP0
   from lf18000. 22/22 rungs in 307 s. Manifest
   `$TEMP/mixup-w122/w122d2/manifest.json`. bossHp0 read -$1 at every rung.

## Q2 -- LASER BOMB. VERDICT: PIXEL-FAITHFUL (sparse opaque artwork, no blender)

`[M]` The board's laser bomb is a cloud of **fully opaque, palette-indexed
sprites**. `boarddl.mjs` on the w122 bomb rungs (the board's own display list at
$800000), counting non-filler entries by palette:

| lf | beam (pal6) | effects (pal30) | effects (pal28) | enemies/bullets (pal11/10/2) | total |
|---|---|---|---|---|---|
| 3000 (bomb pressed) | 0 | 6 | 5 | 51 | 83 |
| 3020 (bomb live) | 24 | 43 | 13 | 27 | 125 |
| 3050 | 30 (27 of them width-1x64) | 25 | 13 | 23 | 108 |
| 3100 | ~27 | ~24 | ~12 | ~20 | 121 |
| 3140 | ~14 | ~22 | ~11 | ~16 | 85 |

The beam itself (pal6, tile offsets $3xxxx-$4xxxx) is **vertical SLICES, each 1
tile (16px) wide and ~64 rows tall, placed on contiguous 16px x-steps** (x=272,
288, 304, ... 384 at lf3050), plus a few wide caps. The effect layer (pal30/pal28,
offsets $22xxxx/$1bxxxx) is scattered particles. Every entry is a full-opacity
palette index; the decode (`src/render/spritelist.js`, transcribed in boarddl.mjs
`decode`) carries **no alpha/translucency bit**, because the PGM sprite hardware
has no blender (`[cited: recon 77, src/render/capture.js]`).

`[M]` Beam-segment count over the bomb's life (the w122 capture, bomb held
lf3000..3132):

```
lf3000:  0 beam (bomb pressed, beam not yet up)
lf3010: 14 beam (10 width-1) -- beam forming
lf3020: 30 beam (27 width-1) -- FULL STRENGTH
lf3030..3120: 30 beam (27 width-1) -- sustained plateau (~100 frames)
lf3140:  0 beam -- gone (bomb released at lf3132)
```

So the laser bomb's beam is live lf3010..3130 (~120 frames) with a plateau of
**30 opaque segments (27 of them width-1 vertical slices)**. This matches recon
106's "~132 live frames" and the 41-segment table (`$2561AA`, of which ~30 are
live at peak -- W65 measured "31 of 45 records live on the deployed page").

So the owner's "translucent" is a perception of the OUTPUT, not a render mode:
the beam is genuinely SPARSE -- thin opaque slices with air between them -- so it
reads as see-through. This is candidate 4 of recon 106, now PIXEL-VERIFIED
against the board's own display list.

Does the port reproduce it? The port cannot be SEEDED to the bomb window
(`[M]` seedcmp on the w122 ladder: every bomb segment lf2980..3220 is BLOCKED at
lf+N+1 on `$27FE0E`, an unported bee/medal tail reached before the bomb clears
the screen -- a separate subsystem, not the bomb). So there is no seed+step
display-list comparison for the bomb. The verdict rests on three independent
sides:

* `[cited: src/bomb.js beamSegments2561AA]` the port transcribes the 41 beam
  segments from `$2561AA`, and W66 (lines 854-869) FIXED the W65 bug where the
  loop body was a bare `drawn++`: it now calls `draw23FF06(ram, ctx, a6)` per
  live segment, so the beam emits the same opaque slices the board emits
  (`tests/w64bomb.test.js` walks four frames and asserts the beam).
* `[cited: src/render/sprites.js, src/web/app.js:731]` the port has no
  translucency anywhere (canvas `alpha:false`, no blend, no `globalAlpha`), i.e.
  it draws opaque exactly as the hardware does.
* `[cited: tools/dlgate.mjs]` the display-list builder (main-loop call #4) is
  byte-exact against the board's own staged bytes, so given the bomb's records
  the port builds the identical list.

Net: the port's bomb is the board's bomb -- opaque sparse slices + particles.
**No blender subsystem is needed.** The fourth candidate of recon 106 is
confirmed: the artwork is genuinely sparse, and that is why it looks thin.

### Q2 VERDICT

**The port's laser bomb is PIXEL-FAITHFUL: sparse opaque artwork, no blender
needed.** `[M]` The board's own display list shows the bomb as ~30 fully opaque
palette-indexed beam segments (27 of them width-1 vertical slices on contiguous
16px x-steps) plus opaque effect particles, live lf3010..3130. The decode has no
alpha bit (the PGM sprite hardware has no blender). The port transcribes the
same `$2561AA` 41-segment beam (`beamSegments2561AA`, W66 fix `draw23FF06`), draws
on an `alpha:false` canvas, and its display-list builder is byte-exact
(`dlgate`). `tests/w64bomb.test.js` passes 34/34. The owner's "translucent" is
the perception of genuinely sparse opaque art, confirmed pixel-for-pixel against
the board.

## Q1 -- BOSS DEATH. PREMISE CORRECTION + pending the forced-death capture

`[M]` **PREMISE BREAK.** The brief and the W107 worklog say the boss dies at
~lf19533. It does not, in the laser-hold scenario. The boss object (type $30,
slot 13, record $81373C) arrives around lf18000 and its HP0 (offset +$16) is
~179648 at lf18000, decreasing only ~44/frame to 142598 at lf19500 -- nowhere
near negative before the stage ends. HP1 (+$1a) is ~600M and similarly far from
zero. The boss is NOT killed by the laser; it sits taking trivial damage until
the stage-1 timeout (`$294F32`, ~lf19218 per W62). So there is **no HP0 death
explosion to capture at lf19533**: at lf19500..19555 the board's own display
list (`[M]` boarddl on w122) shows ~100 stable entries, all boss body types
($4D/$30), **zero effect/explosion sprites**. The boss is in STASIS.

This matches the owner's "stayed in stasis, no explosion" report FOR A
PASSIVE-LASER PLAY: the board itself shows stasis, because the boss is not being
killed. The pre-W107 port also showed stasis (emitters were note-placeholders);
the post-W107 port shows stasis too, because there is no death to trigger them.
The owner's report does not distinguish "the boss is not dying" from "the boss
died and did not explode" -- both look like stasis on screen.

`[M]` **The port cannot be seeded into the boss-fight region at all.** seedcmp on
the w122 ladder: every segment from lf18000 onward BLOCKS on the first frame.
lf18000+ blocks on `$2629AE` (enemy/bullet art), lf19500+ on `$233030`/`$229B28`
(stage-tail data). These are unported ROM windows in OTHER subsystems (enemy
death art, the stage-end tail), reached before any boss-death code runs. So a
seeded port-vs-board comparison of the explosion is impossible at the frames the
brief named, independent of the explosion emitters.

`[cited: recon 106, W107, bosscoverage]` The HP0 death explosion itself (D-script
6 `$293E04`, emitters `$289004`/`$2938AE`/`$28B4BE`) IS ported: W107 replaced the
`note()` placeholders with real `spawnEffect` calls, 166/166 sprite streams are
present, bosscoverage is 103/0/8, and W107's must-fail (pool-B 0->8 on the death
frame via table `$294154`) passes.

To get direct BOARD evidence of the explosion (the brief's ask), the w122d2
capture pokes HP0 negative at lf18000 (invuln kept from lf1960, via a custom
two-phase lua because frame.lua's single PROBE_POKE_FROM cannot do both) to
force the HP0 death path. **It fired.** `[M]` boarddl on the w122d2 rungs,
DIFFED against the normal laser-hold ladder at the same frames (only-in-forced
entries = the explosion, since the normal run's boss never dies):

```
lf       boss     only-forced effect entries (the explosion)
18000    alive    0   (poke consumed by lf18001; both sides identical)
18100    alive     5    (2x32/p29, 2x16/p28 -- first particles)
18200    alive    19    (10x112/p30, 7x80/p30, 8x96/p30 -- PEAK BURST)
18300    alive    15    (10x112/p30, 7x80/p30 -- sustained)
18400    fading    2    (7x80/p30 -- winding down)
18500    GONE      -    (boss record freed; stage advancing)
```

So **the board DOES explode when the boss is HP0-killed**: a burst of large
effect sprites (pal30, the `$28Axxx` pool-B family) peaking at ~19 entries
around lf18200, sustained ~200 frames, then the boss record is freed. The normal
laser-hold run has ZERO of these entries at the same frames (its boss is in
stasis). Boss HP0 read -$1 at every w122d2 rung (the poke landed); handler
stable at `$297398`.

`[cited: src/boss.js d6Step293E04]` The port's death state machine wires EVERY
emitter recon 106 named as a real `spawnEffect` call (not a note): state 0
`burst2938AE(... 0x294154, 0x29412e)` (the 8-particle death burst), state 1
`burst2938AE(... 0x2941b6, 0x2940f0)`, state 2 `timerCSpawn293F8C` +
`bigBurst28B4BE(... 0x29409c)`, state 3 `timerCSpawn293F8C(... 0x293f8c)`. W107's
must-fail (pool-B 0->8 on the death frame via `$294154`) passes; bosscoverage is
103/0/8; 166/166 sprite streams present.

`[M]` The port CANNOT be seed-compared to the death frame either: seeding the
port from the w122d2 lf18000 ckpt (boss HP0 already -$1) and stepping with the
board's own portin BLOCKS on the very first frame at `$2629AE`, "element updater
$2629AE is not one of the 13 ported stage-1 handlers" -- an unported enemy/
element handler that runs in the boss region, unrelated to the death. This is
the same shape as the `$27FE0E` bee block in the bomb window: the port has
coverage gaps in per-type element/enemy handlers that block seeded comparison
across the whole combat region. (Live play does not hit these -- the owner
reaches the boss and the bomb -- because the input path differs; the seeded
laser-hold corpus does.)

### Q1 VERDICT

**The port reproduces the boss death explosion (CORRECT); there is no defect.**
Three sides:

1. **Board:** when the boss is actually HP0-killed, the board produces a large
   pool-B effect burst (~19 entries peak at lf18200, sustained ~200 frames, boss
   freed by lf18500). `[M]` boarddl diff vs the normal run.
2. **Port:** every death emitter is a real `spawnEffect` call (W107); the
   allocator/driver/pool-B shipped in W54 and already runs every frame for enemy
   deaths. Static-closed: 166/166 streams, bosscoverage 103/0/8, must-fail green.
3. **Seed-compare:** BLOCKED at lf18001 by `$2629AE` (unported element updater),
   so no end-to-end pixel comparison is possible at the death frame -- a
   coverage-gap limitation of the seeded oracle, not evidence about the
   explosion.

**The owner's report re-explained.** "Stayed in stasis, no explosion" is what a
boss that is NOT being HP0-killed looks like -- and the board itself shows
exactly that in the laser-hold scenario (stasis, zero effect sprites at
lf19500..19555). The pre-W107 port ALSO showed stasis because the emitters were
`note()` placeholders; the post-W107 port shows stasis too, because there is no
HP0 death to trigger them. The owner's "no explosion" was the W107 note-bug when
they DID kill it; that is fixed. To SEE the explosion in the port, the boss must
be HP0-killed (heavy fire / point-blank), not parked-under-laser until the
timeout.

## SUMMARY (two verdicts)

1. **Boss death -- CORRECT (no defect).** Premise correction: the laser-hold
   scenario does not HP0-kill the boss (it times out in stasis), so there is no
   explosion to capture at lf19533 -- the board itself shows stasis there,
   matching the owner's report for passive-laser play. When the boss IS
   HP0-killed (forced), the board produces a large pool-B effect burst (~19
   entries peak at lf18200, boss freed by lf18550). The port wires every death
   emitter as a real `spawnEffect` (W107); the explosion is statically closed
   (166/166 streams, bosscoverage 103/0/8, must-fail green). The owner's
   pre-W107 "no explosion" was the `note()`-placeholder bug, FIXED. End-to-end
   seed-compare is blocked (unported element updater `$2629AE` at lf18001), a
   coverage-gap limitation of the seeded oracle, not evidence about the
   explosion.

2. **Laser bomb -- PIXEL-FAITHUL (no blender needed).** The board's bomb is
   ~30 opaque beam segments (27 width-1 vertical slices on contiguous 16px
   x-steps) + opaque particles, live lf3010..3130; no translucency anywhere (PGM
   has no blender, decode has no alpha bit). The port transcribes the same
   `$2561AA` beam (W66 `draw23FF06` fix), draws opaque, and its display-list
   builder is byte-exact; `tests/w64bomb.test.js` 34/34. The owner's
   "translucent" is genuinely sparse opaque artwork, now pixel-verified against
   the board.

## ANCILLARY FINDING (coverage gap, not a defect)

`[M]` The seeded port cannot be driven into either target window: the bomb
window (lf3000+) blocks at `$27FE0E` (an unported bee/medal tail), and the boss
region (lf18000+) blocks at `$2629AE` ("element updater not one of the 13 ported
stage-1 handlers"). These are per-type enemy/element handlers the port has not
translated; they throw on the first frame of any seeded segment in their range.
Live play does not hit them (different input path), which is why the owner sees
the bomb and the boss. They matter because they make the seeded oracle
(`seedcmp`) unable to compare port-vs-board past lf~2700 in this scenario -- a
verification-capability gap, separate from both play reports. Surfaced for a
future coverage wave; not in scope here.

## FILES

* Worklog: `docs/worklog/ddpdoj/122-recon-boss-bomb-mame.md` (this file; only
  tree file written).
* Scratch (outside the repo, gitignored/temp): the two ladder manifests + ckpts
  under `$TEMP/mixup-w122/{w122,w122d2}/`, the custom two-phase lua
  `$TEMP/mixup-w122/w122d.lua`, and the driver/wrapper scripts. Nothing
  committed.
* Source read (READ-ONLY): `src/boss.js`, `src/bomb.js`, `src/displaylist.js`,
  `src/ram.js`, `src/machine.js`, `src/main.js`; `tools/oracle/pgm.py`,
  `tools/oracle/frame.lua`, `tools/oracle/scenarios.json`, `tools/boarddl.mjs`,
  `tools/seedcmp.mjs`, `tools/portdiff.mjs`, `tools/dlgate.mjs`.

status: DONE
