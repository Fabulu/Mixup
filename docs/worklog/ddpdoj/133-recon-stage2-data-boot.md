# W133 stage-2 data export + boot verification (S1 + S2)
status: DONE
wave: 133   role: impl   started: 2026-08-08

## The task, as I understood it
Phase 3 of the stage-2 plan. Two deliverables, no `src/` game-logic change:
  * S1: export the stage-2 BACKGROUND data windows the boot reads, plus the
    extent invariants, into `tools/export-tables.py`.
  * S2: a boot-verification test (`tests/w133stage2boot.test.js`) that seeds
    from the last `stage1-sweep` rung (lf19500), drives past the stage clear
    into stage 2, and asserts the BACKGROUND scrolls ~36 frames before the
    first stage-2 BGELEM throws `unreached($2627AC)` cleanly.

The brief told me to CHECK ITS OWN PREMISE. It also carried the W133 recon's
two corrections to the W119 plan: (1) the spawn-record stride is 8 (already
ported); the x16 at `$263392` is the stage-table index, not a spawn stride;
(2) the garbage-spawn risk is structurally impossible, because the port never
calls `installStage` and the walker breaks at stage-1's `$FFFF` terminator
before it could read `$2325D0`.

## The premise check (the first thing I did)
I verified every cited address against `maincpu.bin` and checked which windows
were already exported. Three findings, one of them load-bearing:

  1. WINDOW 1 (`$229DF8`, `$800`, the stage-2 BG palette block) is ALREADY
     EXPORTED, by W124. `tools/export-tables.py` line ~1739:
       (0x229DF8, 0x0800, "W124: next-stage BG palette block $229DF8 ...")
     The W124 worklog (6.3, "THE SEEDED GATE CANNOT REACH THE BANNER DRAIN")
     records that this window was added in that session and that the COLUMN
     STREAM behind it was deliberately LEFT for "a future data-export wave"
     because it is not result-screen logic. This wave is that future wave.
     So S1 does NOT re-add window 1; it adds window 2 and the invariants that
     BOUND window 1 from both sides.

  2. WINDOW 2 (`$228658`, `$17A0`, the stage-2 BG column stream) is NOT
     exported. This is the gap W124 named. Confirmed: no window with base
     `$228658` exists.

  3. WINDOW 3 (`$223000`, `$2300`, the stage-2 SPAWN palette-bank sources) is
     NOT exported. The brief flags it "live-page-only ... DEFER if
     headless-only". The boot test never reaches it (the spawn walker no-ops,
     see S2 finding 5), so it is deferred here with a named comment, not
     skipped silently.

## The addresses, MEASURED out of the image
`BGTAB` (src/background.js) holds the three per-stage pointer tables. Each is
indexed by `stage*4`, so stage 2 is entry [1] in every one:

  $261252[1]  palette    = $229DF8   (window 1, W124)
  $261266[1]  colStream  = $228658   (window 2, this wave)
  $262302[1]  elemTable  = $26227E   (the stage-2 BGELEM handler table)

and `$26227E[0]` (entry 0, the first op-$10 constructor stage 2 fires) is
exactly `$2627AC`, which is NOT in the port's 13-element `BGELEM_BY_CTOR` map.
That is the clean throw the boot test asserts.

Extent invariants, all three holding exactly:
  $229DF8 + $800  == $22A5F8   (stage-3 colStream landmark; abuts)
  $228658 + $17A0 == $229DF8   (window 2 abuts window 1)
  $17A0 % 36      == 0         (168 columns of 36 bytes exactly)

## S1: what shipped
  * One new window: `(0x228658, 0x17A0, "W133: the STAGE-2 BG column stream,
    168 columns x 36 B = 6048 B ($2611D6 -> $26135A), the table W124 named as
    the remaining gap")`.
  * `check_stage2_boot_data(d)`: derives the W124 window-1 declaration and the
    new window-2 declaration out of SHOT_WINDOWS (so a typo in either fails
    the export, not a player's machine), asserts the three extent invariants,
    re-reads the three per-stage pointers out of the image, and pins
    `$26227E[0] == $2627AC` so the clean-throw target cannot move without the
    export catching it. Called from `build()` alongside the other checks.
  * Window 3 DEFERRED: a comment block names `$223000..$2252F8` (19 banks x
    64) and `$246BB8` (the 20th, already in W91) as the stage-2 SPAWN palette
    sources, and says why no window is added this wave (the headless boot
    never spawns a stage-2 enemy; the live page is a future port).

## S2: the boot-verification test
`tests/w133stage2boot.test.js`. Seeds from the lf19500 rung of `stage1-sweep`
(the last rung, past the boss timeout lf19218), steps 100-400 frames, and
asserts the windows-exported path: the BG scrolls (camBgAccumulate `$80B012`
advances for ~36 frames) and then the first stage-2 BGELEM fires ->
`elemSpawn` -> constructor `$2627AC` is not in `BGELEM_BY_CTOR` -> the test
catches `Unreached` with `romAddress === 0x2627AC`. Also asserts the
no-garbage-spawn invariant: `LIVE_CURSOR $8132CC` is unchanged across the
whole walk (the port never calls `installStage`, so the walker breaks at
stage-1's `$FFFF` terminator and the cursor keeps its stage-1-end value).
Skips loudly when the ladder is absent (CI), like `w85bucket2`.

## The must-fail (MEASURED this session)
WITH both windows (the committed state): the BG scrolls, then at lf20230 /
scroll clock `$24` the boot throws `Unreached($2627AC)` -- the stage-2 BGELEM
constructor the port has not translated.
WITHOUT window 1 (`$229DF8`): the throw is EARLIER (lf19651, one frame into
stage 2) and at `$229DF8` -- the `rom.bytes($229DF8, 2048)` read inside
`backgroundInit`'s `install2415E8`.
WITHOUT window 2 (`$228658`): the throw is EARLIER (lf19651) and at `$228658`
-- the column-stream `rom.u32(colptr)` read inside the ring pre-fill.
Both windows are load-bearing; the test asserts `romAddress === $2627AC`, so
removing either turns it red at a different, earlier address. (The first RED
run of this reported window 1 as inert -- a case-sensitivity bug in the probe:
window bases are stored UPPERCASE, and a lowercase `.includes` filter never
matched. Re-run with the right casing and window 1 is as load-bearing as 2.)

The throw's own timing, for the record: stage 2 boots at lf19650 (stage index
1, `$813096` 0 -> 4), the BG accumulator advances ~289 times over the next
~580 logic frames (the scroll clock climbs 0 -> `$24`), and the first op-$10
BGELEM fires at lf20230 / clock `$24`. The seed parks LIVE_CURSOR at `$231704`
(stage-1's `$FFFF` terminator) and it stays there for the whole boot.

## What I could not do, and why
  * Window 3 (stage-2 spawn palette sources): deferred. Headless-only this
    wave; named in the export as the next live-page data item.
  * Stage-2 CONTENT (enemies, bullets, the 168-column picture itself): out of
    scope, a future port. This wave only boots the page far enough to prove
    the data is present and the constructor throw is the honest stop.
