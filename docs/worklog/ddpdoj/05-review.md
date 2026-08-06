# WAVE 5 REVIEW - enemies and the three weapons (commit 3fd078c)
status: DONE - defects found, none blocking; the wave's own BLOCKED status is honest
wave: 5   role: review   started: 2026-08-01

## The task, as I understood it

Verify by content, not by report: read `3fd078c`, read the code against the
decrypted image, re-run the measurements. Check hardest for build-A addresses
(`$13xxxx`), code/ROM mismatch, fall-through claims, checks that cannot go red,
things silently unported that read as finished, and unlabelled slowdown numbers.

I am a READER. I made no edit to `games/ddpdoj/src/` or tools that survived this
session (see "the two deliberate breaks" below, both restored byte-identical),
and I committed nothing.

## What I MEASURED (every command run here, output quoted)

### Everything the implementer claimed GREEN reproduces

```
node --test games/ddpdoj/tests/
  # tests 35  # pass 35  # fail 0  # skipped 0

python games/ddpdoj/tools/oracle/pgm.py flyaround
  ALLOC events ($24111E/$241182/$2411E2/$241238): none
  DIGEST c752ac4c2ed0d9733cefbd95908f5b5eabb32b6df7af1c36d140f9a3c3c73209
  RESULT 0 DIVERGENT FRAMES on 34 columns over 2200 logic frames
  MACHINE romname=ddpdojblk maincpu_size=6291456 maincpu_fnv64=D4C25CA9C91B9D47
  BUILD required=B frames_on_required=3501 frames_on_other=699
  armpc 13C5B6:699 23C212:3501

pgm.py flyaround --reuse --break <m>    ALL FIVE RED
  no-phase-mask    c3910 lf=2001 port=1302 board=2   (c3912/c3914 -> board=6)
  clamp-first      py lf=2087 port=25875 board=25856  (7 columns)
  dy-off-by-one    py lf=2001 port=4720 board=4719
  edge-after-store p1edge lf=2001 port=0 board=1
  no-tilt-decay    ptilt lf=2321 port=0 board=65532  (5 columns)

node tools/determinism.mjs .../fly-around.tsv .../fly-around.seed2000.bin
     --seed-lf 2000 --poke 810424=FF
  IN-PROCESS 1/2 and SUBPROCESS: c752ac4c...  IDENTICAL

python pgm.py gate                       (1m37s, two 2600-frame runs)
  run 1 = run 2 = 635bb92f1a9dc81e968bab5e755f807e78c0c18538af5cfc8c29974520d84884
  IDENTICAL
```

The gate hash is the wave-2 hash (`02-review.md:37`), unmoved. `_cmd_gate`
hashes `tsv.read_bytes()` only, so this is exactly the right evidence for the
claim that `frame.lua`'s new sprite-queue census added a CENSUS line and no TSV
column. Verified by reading `_cmd_gate`, not by trusting the sentence.

### The sprite cap: the whole sweep reproduces, to the bucket

`python pgm.py spritecap` (6m19s, 7 MAME runs):

```
control (via gate)  high_water=$5A0 (120/251) queue_full_events=0
POKE $0600          $BA0 (248/251)  full=0
POKE $0900          $BC4 (251/251)  full=544
                    buckets_cut[80AFC2:11 80AFC4:23 80AFC6:41 80AFC8:181
                    80AFD0:62 80AFD6:141 80AFDA:11 80AFDC:12 80AFDE:1
                    80AFE2:6 80AFE6:55]   halt_loop_interrupts=0, build B
POKE $0A80          $FE4 (339/251)  full=31   buckets_cut[C2:6 D0:1 D6:24]
POKE $0B40 / $0B70 / $0BB8   $10A4 / $10D4 / $111C, full=0
```

Identical to the worklog, digit for digit. The command's own refusal to read
`d_ram`/`d_spr`/`pix` as evidence is real - I checked the code path, it prints
those columns as "moved" and then explicitly says the only claim is that
`$23D75A` executed and the machine survived.

### The recon: re-run with my own driver, reproduces exactly

The wrappers the worklog cites (`.../w5/hunt.py`, `.../w5/recon.py`) are **not
in the tree** - only `w5recon.lua` is committed. I wrote my own driver in the
scratchpad from the lua's ENV contract plus `scenarios.json`'s `stage1-open`
script (`bootPrefix.versionB + ";" + tail`, 2600 frames, `W5_REQUIRE_BUILD=B`):

```
ENEMY handler pointers dispatched: 5 DISTINCT
ENEMY handlers 2688CC:8411 268232:740 26A2E2:662 269CEA:429 275914:133
ENEMY type words: 24 distinct  8002:620 8000:612 ... 8016:39
ENEMY bands C_common48:10375 MISMATCH_vs_815E9C:44
ENEMY live per logic frame max=24 hist 0:1962 19:103 17:90 ...
SHOT kind words: 16 distinct 8048:3842 814A:2585 83CA:1285 82C8:668 ...
SHOT live per logic frame max=20 hist 0:2025 20:267 ...
SPRQ high-water $80AFC0 = $5A0 (120 of the 251-record cap)
DONE logicframes=2600 videoframes=2636 fails=0
```

Every number matches the worklog. The four reached low nibbles are {0,2,8,A},
and `SHOT_HANDLERS_SEEN`'s four sums (776 / 1214 / 4023 / 4035) add up from the
16 measured words correctly.

### Independent re-derivation of the 29-call-site claim

Not via `xref.py` (two-sides rule): a from-scratch `bsr.b`/`bsr.w`/`bsr.l`
scanner over `$200000-$2A0000`.

```
bsr sites targeting $23D726: 29
  followed by bcs: 29
  bcs target == $23D624: 29
  $23D3EC $23D400 ... $23D61A
```

### Listing spot-checks - every cited address matches the image

`$263502..$263582` (enemy driver), `$2636D6..$263752` (enemy allocator),
`$2410BC..$2410F0` (object driver head: `bsr $241262` then `bsr $24111E`, in
that order - the port's `commitKills` then `commitCreates` is right),
`$2410F2`/`$24110A` (the memmoves), `$24111E..$241180`, `$241182..$2411E0`,
`$2411E2..$241236`, `$241238..$241290`, `$253A70..$253ADC` + the 16-entry table
at `$253ADE`, `$249B2C..$249BF8` (including the `bra $249BFC` / `bra $249D2C`
jump table and the `$249CA8`/`$249CEA` free-slot failure), `$23BE8C..$23BEE8`
(the three masks), `$23D726..$23D760`, `$23D762..$23D79C`, `$23D65E` clamp,
`$28B5E0` (type 5), dispatch table `$240F62` (entry [5] = `$28B5E0` pri `$18`;
types 10/2/1/5/11/4/0 map to priorities 1F/1C/1A/18/0A/09/09 - the census
matches).

**Fall-through trap: nothing claims a false end.** `$263582 rts`,
`$253ADC rts` immediately before the dispatch table at `$253ADE`,
`$241180/$2411D2/$2411E0/$241236/$241260/$241290 rts`, `$263738/$263752 rts`.

**Build check: no build-A address is used as a build-B fact.** Every wave-5
address is `$23xxxx`–`$28xxxx`. The only `$13xxxx` constants in `src/` are in
`input.js`, `isr.js` and `machine.js`, all documented as build A's ISR reached
through the RAM vectors `$801470`/`$801478`, and every run I made prints
`armpc 13C5B6:<boot> 23C212:<gameplay>` and `BUILD required=B`.

### Two deliberate breaks, red, then restored byte-identical

| break | file | result |
|---|---|---|
| `killById`'s `cmp.w` → full 32-bit compare | `src/objalloc.js` | `not ok 7 - $2411FC compares the LONGWORD id as a WORD` |
| drop the `btst #5` half of the `($D,A5)` split | `src/enemies.js` | `not ok 13 - $263502 counts survivors into $815E9C and splits by ($D,A5) bit 7 / bit 5` |

33 pass / 2 fail with both breaks in; only the targeted tests moved. Restored:

```
before:  2a94a14322922a34699d2156538e152d4d1133e4542900555054884109833a0e  objalloc.js
         6f87cc6bc9dfd97cb6c2b3d2374c244981fd8f1d5500346f2565796df057366c  enemies.js
after :  identical (both)          node --test -> 35 pass, 0 fail, 0 skipped
```

(`git checkout HEAD --` rewrote them CRLF because `core.autocrlf=true`; I
converted back to LF, which is what reproduces the pre-review hashes.)

## What I RULED OUT

* The gate hash is not a tautology: `_cmd_gate` hashes the TSV bytes, and the
  new census is stdout only. Read the code.
* The `no-phase-mask` mutation is not a fake red: it writes the *unmasked*
  counter through `setU16`, so it restores wave 4's exact behaviour, and the
  three columns move on the first compared frame (lf 2001).
* `$2411FC`'s word compare, the `$50`-per-longword kill queue, the LIFO drain,
  the `bge`/`blt`/`bpl` senses, the `ori.w #$8000`, the 40-word record copy, the
  `((D0 >> 1) & 6) + ($2d,A6)` word-shift-then-byte-mask, and the two-player
  `swap D6` loop are all translated as written. I checked each against the
  bytes; the `lsr.w` before `andi.b #$6` is a genuine no-op on the stale upper
  byte, so the literal translation is also the correct one.
* `enemies.js`'s `bpl` reading is literal and right: `tst.w (A5) / bpl` skips
  when bit 15 is clear, which is what `(rec & 0x8000) === 0 -> continue` does.
* No new scenario was smuggled in: `scenarios.json` is untouched by `3fd078c`.

## Defects (details in the structured return)

1. `memmoveDown`/`memmoveUp` are no-ops at `bytes == 0`; `$2410F2`/`$24110A`
   are not (`lsr.l #2` → 0, `subq.l #1` → -1, `dbra` still loops 65,536 times).
   Reached when the priority insert lands on slot 19, or the killed object is in
   slot 19. Not reachable in today's corpus (8 live objects).
2. `$815E9C` is **not** read by the frame-sync governor. `xref.py abs 815E9C`
   → `$263504`, `$263548` only (both inside the enemy driver) in build B. The
   governor `$23C272` reads `$815EA0` (`$23C27A`), `$81295C`, `$81295E`. The
   wrong attribution is now in `NOTES-machine.md`.
3. `enemies.js` hoists the `$813176` read out of the per-enemy loop; the ROM
   re-reads it at `$263528` inside the loop. (`weapons.js` hoists correctly -
   `$253A76` really is outside its loop.)
4. "type 5 is 15 subsystem calls" does not reproduce: 23 consecutive `jsr`s at
   `$28B5E6..$28B66A`.
5. `NOTES-machine.md`: "poking `$0A80` or higher ... the equality guard is
   stepped over entirely" - at `$0A80` it fired 31 times, in the same run.
6. The recon wrappers are not committed; `ctx.allocEvent?.()` re-introduces
   silence for a caller that omits the callback; `src/main.js`'s `77,725 cyc` /
   `15,594 cyc` still carry no "MAME-timed, uncalibrated" label.

## ENVIRONMENT - the shared git index is dangerous right now

Not caused by this wave and not fixed by me:

```
git diff --cached --name-status   # 41 entries, including
D  games/ddpdoj/src/{budget,framesync,input,isr,machine,main,objdriver,player,
                     ram,state,unported,vectors,weapons}.js
D  games/ddpdoj/tests/*.js
D  games/ddpdoj/tools/{breakage,determinism,portdiff}.mjs, oracle/{xref.py,
                      objhunt.lua,phase.lua,w5recon.lua}, assets.py, ...
D  docs/worklog/ddpdoj/0{1,2,3,4,5}-*.md
```

`.git/index` (mtime 04:42) holds a tree that predates the ddpdoj port. A plain
`git commit` through it would ship a HEAD with the whole ddpdoj port deleted.
Everyone must keep using `GIT_INDEX_FILE=.git/ddpdoj.index`.

Disclosure: my one `git checkout HEAD -- src/objalloc.js src/enemies.js` re-added
those two paths to the shared index (they now match HEAD there). Nothing else of
mine touched it.

## What I could not do, and why

See `notReRun` in the structured return. In short: the wave-3 gfx/zoom/sprite/
sound stages, the rest of `pgm.py check` (rtc, drc, seedstate, pixred, overrun,
objdriver), the scenarios other than `fly-around` and `stage1-open`, and a fresh
`derive.py` regeneration of `out/maincpu.bin` (I used the existing image; every
run printed `maincpu_fnv64=D4C25CA9C91B9D47`, which matches the wave's pin).
The hitbox, the score and the chain words remain unmeasured by any wave.
