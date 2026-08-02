# Wave 25b recon — crack the "reaching the boss page" blocker

status: IN PROGRESS
wave: 25b   role: recon/tooling   started: 2026-08-02

## The task

W24b and W25 both DEFERRED the in-situ field comparison of the late-stage
sub-states because no in-tree button script reached the boss page `$0C00`
(`$1B = $82`, the countdown entry). Every from-boot attempt died to terrain
`$C2C1`; a powered poke (`0044=2,0045=2,0046=5,0041=1`) with the default
`RA` tail stalled at `maxScroll = 2661` (`$0A65`), ~411 px short of `$0C00`.

BUT the wave-20 sweep harness (`20-recon-sweep-harness.md` part 4) already
PROVED the boss reachable: `bossreach.py` held seven different directions for
the last 4000 frames and found that `RUA` and `UA` reach scroll `$0D00` with
ZERO deaths and take `$1B` through `$81 $82 $83 $84 $85`. The reaching method
EXISTS; it just was never turned into a recorded `scen/` field dump + a wired
compare scenario. This wave does exactly that.

I am a READER on `games/gradius/src/` (no game-logic edits). Deliverables are
all measurements: a reaching-method confirmation, two `scen/` field dumps
(endchain + game-over), and the gate's 1022-field comparison result.

## Deliverable 1 — reconstruct + confirm the reaching method (DONE)

The reaching method is `bossreach.py`'s `boss` run (`sweep.py --only boss`):

```
script  200:,10:S,190:,1350:RDA,324:RUA,80:RDA,2846:RA,4000:RUA
poke    0044=2,0045=2,0046=5,0041=1 @ 400-8999
```

Re-run fresh in ONE Mesen process via `tools/oracle/reachcheck.py` (9000 frames)
and MEASURED, not quoted:

```
maxScroll $0D00 at frame 8251; deaths 0; distinct $1B [0,1,2,3,4,128,129,130,131,132,133]
lag drops 1

$1B transition timeline (frame : $1B : scroll):
  f  283  $1B = $01   scroll $0000   (stage intro)
  f  309  $1B = $80   scroll $0000   (ordinary play)
  f 6458  $1B = $81   scroll $0C00   ($9A56 boss-page transition, W24)
  f 6459  $1B = $82   scroll $0C00   (the countdown: 1280 frames at this rank)
  f 7739  $1B = $83   scroll $0C00   (1-frame transition, W24)
  f 7740  $1B = $84   scroll $0C00   (512-frame 0.5 px crawl + despawn, W24)
  f 8252  $1B = $85   scroll $0D00   ($84 advance spawns the boss -> $B914, W26)
```

**Cracked.** The `RUA` hold from frame 5000 reaches the boss page `$0C00`
(`$1B = $82`) at frame 6459 with ZERO deaths and maxScroll `$0D00`. The blocker
was never "the boss is unreachable" -- it was that the default `RA` tail dies to
terrain `$C2C1` at scroll `$0A28` (frame 5514), and W24b/W25's reaching attempts
all used that tail or the poke without the `RUA` switch. The `RUA` hold flies
the ship above the death corridor.

## Deliverable 2 — record `scen/endchain.json` through `$82`/`$84`/`$85` (RECORDING)

A deep-align scenario seeded at frame 6160 (scroll `$0B6B`, the CLEAN boss
approach band the wave-20 sweep measured), driven by the reaching tail, with the
powered poke applied from frame 400 via an ABSOLUTE `@400-8999` window.

`scen.py` was enhanced (W25b) to accept the absolute `@FROM-TO` poke form, which
the existing whole-window-from-align and one-frame-`@+N` forms cannot express.
The endchain's power-up poke must begin at frame 400 -- long before the deep
align -- or the ship dies to terrain `$C2C1` at scroll `$0A28`, which is what
blocked W24b and W25. `probe.lua` and `porttrace.mjs` both already spoke this
absolute form (the sweep uses `@400-8999`); `scen.py` just had to stop rewriting
it. The `--timeout` for deep scenarios was also raised from 300s to 1800s.

## Deliverable 3 — record the `$96FB` game-over window as a scen dump (DONE)

An unpowered run (`1350:RDA,324:RUA,80:RDA,2246:RA`, no poke, align 3800) reaches
`$1B = $C0` (`$96FB`) at frame 3967 and holds for ~397 frames before the
continue-window timeout at `$9751` restarts to title. Recorded as
`out/scen/gameover.json` (4400 frames). MEASURED off the unpowered sweep's own
RAM dump, the `$1B` ladder through the window is `$80 -> $A0 -> $C0 -> mode 0`,
four deaths deep.

## Deliverable 4 — wire the gate + run it (gameover DONE; endchain PENDING)

Both scenarios use a new `compareUntilThrow` mechanism added to `compare.mjs`
(W25b): unlike `expectThrow` (which is NOT field-compared), a
`compareUntilThrow` scenario runs the port with `stopOnThrow`, field-compares
every frame BEFORE the throw, and then verifies the throw fires at the declared
ROM address. A surprise non-throw is a FAILURE, not a quiet pass.

**gameover: GREEN.** 563 frames compared (align 3800 through the `$9751`
throw at f4364), **0 divergent TIER 1 fields**, 0 display-list mismatches, lag
exact. The throw at `$9751` fired at frame 4364 as declared. The `$96FB` hold,
the `$96EF` dying arm and the death itself are all field-exact for the first
time.

endchain: awaiting the scen dump (Mesen recording in progress).
