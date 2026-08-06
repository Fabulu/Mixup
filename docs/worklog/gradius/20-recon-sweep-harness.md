# Wave 20 recon 4/5 - sweep the WHOLE stage with the seed-anywhere machinery

status: DONE
wave: 20   role: recon   started: 2026-08-01

## The task

Wave 10 built "seed the port at ANY cartridge frame" and it was used for two
scenarios. The owner expected it to be used to test the WHOLE stage. Build the
sweep, run it, and deliver a MAP: at scroll X the port does Y.

Method rule for this round (docs/knowledge/09): **the ROM is the INVENTORY, the
oracle is the VERDICT.** So this file has two halves: a static enumeration of
everything stage 1 can spawn, counted out of the PRG; and a dynamic sweep that
says what the port does at every point of the stage.

I am a READER. Nothing under `games/gradius/src/` was touched. Three new tools
under `games/gradius/tools/oracle/`: `stagewaves.py`, `sweep.py`, `sweep.mjs`,
plus `bossreach.py`.

---

## PART 1 - THE INVENTORY, out of `assets/prg.bin` (no emulator)

`games/gradius/tools/oracle/stagewaves.py` decodes stage 1's wave lists with the
port's own arithmetic (src/enemies.js `runEngine`/`fireWave`/`singleSpawn`/
`formationSetup`) and resolves every record to the `$AE1C` handler it dispatches.
It reads the ported set OUT OF `src/enemies.js` (the `case 0x…:` labels of
`dispatch()`) rather than duplicating it, so it cannot claim something is ported
after someone removes it.

```
python games/gradius/tools/oracle/stagewaves.py
```

```
=== $AE1C DISPATCH TABLE: 42 entries, 34 distinct addresses
    ported by src/enemies.js: 13 entries (10 distinct); unported 29 entries (24 distinct)

=== STAGE 1: chunk table $A7DE, end page $0E (scroll $0E00), boss page $0C (scroll $0C00)
-- chunk 0: $61= 0  ptr $A844  10 records   [OK terminator abuts next chunk]
-- chunk 1: $61= 2  ptr $A859  16 records   [OK terminator abuts next chunk]
-- chunk 2: $61= 4  ptr $A87A  20 records   [OK terminator abuts next chunk]
-- chunk 3: $61= 6  ptr $A8A3  17 records   [OK terminator abuts next chunk]
-- chunk 4: $61= 8  ptr $A8C6  19 records   [OK terminator abuts next chunk]
-- chunk 5: $61=10  ptr $A8ED  10 records
-- chunk 6: $61=12  ptr $A8ED  10 records   (the SAME list -- one pointer, three bands)
-- chunk 7: $61=14  ptr $A8ED  10 records

=== TOTALS, stage 1
  wave records            : 112
  distinct wave commands  : 18  $00x5 $01x7 $02x15 $03x8 $04x10 $05x5 $06x3 $07x1
                                $08x1 $09x4 $69x3 $74x1 $80x5 $81x3 $82x22 $83x10
                                $84x4 $96x5
  distinct spawned types  : 12  $04x19 $05x8 $06x22 $07x8 $08x22 $0Fx3 $10x1 $11x6
                                $12x5 $13x14 $27x3 $29x1
  distinct $AE1C entries reached by stage 1's records: 12
     entry  4 $B205 PORTED   19 record(s)      entry 16 $AF88 UNPORTED 1 record(s)
     entry  5 $B0AF PORTED    8 record(s)      entry 17 $B026 PORTED   6 record(s)
     entry  6 $B198 PORTED   22 record(s)      entry 18 $B098 PORTED   5 record(s)
     entry  7 $B6E1 UNPORTED  8 record(s)      entry 19 $B747 UNPORTED 14 record(s)
     entry  8 $B26C PORTED   22 record(s)      entry 39 $AEDD PORTED   3 record(s)
     entry 15 $AF2E UNPORTED  3 record(s)      entry 41 $AEDD PORTED   1 record(s)
  records whose spawn the port CANNOT dispatch: 26 of 112; first at scroll $0440
```

Restricted to the part of the stage a player can actually be in (chunks 0-5,
scroll `$0000-$0BFF`, i.e. everything before the boss page):

```
chunks 0-5 (pre-boss): 92 records, 18 unportable, first at $0440
   by handler: $B747 x8, $B6E1 x6, $AF2E x3, $AF88 x1
```

**The single most important number in this file: the FIRST wave record stage 1
has that the port cannot dispatch fires at scroll `$0440`** - chunk 2, record 2,
trigger `$20`, cmd `$03`, which is table A entry `$03 * 3` → type `$07` →
`$AE1C` entry 7 → `$B6E1`. That is 4.25 pages into a 14-page stage, and
everything after it is downstream of an enemy the port refuses.

Three more tables counted the same way, because "how far along are we" needs a
denominator for each:

| table | ROM | entries | ported | what the unported ones are |
|---|---|---|---|---|
| enemy handler dispatch | `$AE1C` | **42** (34 distinct) | **13** (10 distinct) | 29 entries / 24 distinct routines |
| play sub-states `jt_982F` (`$1B` low nibble) | `$982F` | **16** | **1** (`$80` → `$9A4D`) | `$81` → `$9A0E` is the BOSS/END sequence; `$9A45[stage]` is `$81` for all 7 stages |
| stage-intro states `jt_96C5` | `$96C5` | **5** | **5** | - (wave 4 ported all five) |
| game modes | `$80D4` | **7** | **1** (mode 5 → `$9650`) | `$80E2 $8116 $8121 $8137 $8165 $816C` - title, attract, etc. |
| stage wave-list pointers | `$A7D0` | **7 stages** x 8 chunks | 1 stage targeted | - |

`src/nmi.js` is `if (state.mode === MODE_STAGE) stagePlay(state, res);` **with no
else**, which the sweep below turns from a code reading into a measurement.

---

## PART 2 - THE SWEEP HARNESS

### Why it is one cartridge run and not N scenarios

`scen.py` boots the cartridge TWICE per scenario. A 143-seed sweep would be 286
emulator runs. But `probe.lua` already takes a full `$0000-$07FF` dump on every
sampled frame and `PROBE_VIDEO_AT` already accepts a LIST of frames, so ONE run
gives every seed and the oracle side of every window:

* the SEED at frame f = `ram[f]` + the video blob dumped at f (nametables,
  palette RAM, hardware OAM) - exactly what wave 10's `seedFromCartridge` wants;
* the ORACLE ROWS for f+1..f+W = `ram[f+1..f+W]` read directly. **Every one of
  the corpus's 1022 watched addresses is at or below `$07EA`** (asserted by
  `sweep.py`, printed every run), so the RAM dump IS the watch vector. No 80 MB
  JSON of repeated field names.

`sweep.py` prints `1022 watched addresses, all <= $07EA` before it runs.

### The two runs, and why POWERED is the default

Wave 12 measured that every unpowered run stalls at scroll `$04BD` while the run
carrying power-ups reached `$0A64`. Both are recorded, powered first:

```
python games/gradius/tools/oracle/sweep.py --frames 9000 --every 60
```

```
1022 watched addresses, all <= $07EA
=== powered: 9000 frames, 143 seeds every 60 from 400
    script 200:,10:S,190:,1350:RDA,324:RUA,80:RDA,6846:RA
    poke   0044=2@400-8999,0045=2@400-8999,0046=5@400-8999,0041=1@400-8999
    max scroll $0A64 at frame 5633; lag drops 1; ram 18000 KB, video 326 KB
    dying frames ($1B = $A0): 363, first 5514; distinct $1B values [0,1,2,3,4,128,160]
=== unpowered: 9000 frames, 143 seeds every 60 from 400
    poke   (none)
    max scroll $0644 at frame 7990; lag drops 7; ram 18000 KB, video 326 KB
    dying frames ($1B = $A0): 484, first 2619; distinct $1B values [0,1,2,3,4,128,160,192]
```

The poke carries an ABSOLUTE frame window (`@400-8999`) because `probe.lua` and
`porttrace.mjs` read the SAME string and must apply it at the same `$80B5`.

### The grading is compare.mjs's, on purpose

`sweep.mjs` starts the port at each seed and runs it for a window, with:

* the LIVE WINDOW rule - stop when the cartridge's `$1B` leaves
  `{0,1,2,3,4,$80,$A0}`, the set `src/nmi.js`'s `$96A5` ladder ports;
* the DISPLAY LIST rule on page `$02` - the Y byte of all 64 slots always, all
  four bytes of every slot the CARTRIDGE has live;
* `$36` INFO (compare.mjs's one remaining INFO field);
* `stopOnThrow`, so an unported path is DATA (its ROM address) and not a crash.

**Plus one check compare.mjs cannot do per-window and this can, for free.** The
sweep TILES (`--window` == `--every`), so window k ends on exactly the frame seed
k+1 was taken at: the next seed's video blob IS this window's expected screen.
So every window also compares the port's END-OF-WINDOW nametable (2048),
palette (32), hardware OAM (256, by the display-list rule) and terrain collision
map `$0500-$06FF` (512, out of the RAM dump). **The watch list has ZERO addresses
in `$0500-$06FF`** - counted, not assumed - so without this the sweep would be
blind to `$9F55`'s output.

**And the screen check states its own coverage**, because a check that cannot say
how much of what it compares is the port's own work is decoration
(docs/knowledge/03). Measured over the 42 CLEAN powered windows:

```
the CARTRIDGE rewrote 531 nametable bytes and 137 collision cells inside them
(per-window nametable churn 0 - 106)
```

137 collision cells inside CLEAN windows alone is more `$9F55` output than the
entire 43-scenario gate corpus covers (wave 10 measured 89 across all of it).

**A trap I fell into and measured my way out of.** My first version compared the
hardware OAM byte for byte and reported `118/256 differing` on a window where all
1022 watched addresses and the whole nametable were exact. That is `src/oam.js`'s
declared behaviour (it fills hidden slots with `$F4` in all four bytes; `$8BAB`
writes only the Y byte). Fixed to the display-list rule, which is what
compare.mjs already does for the same reason - and the note is in the code.

### PROVING THE SWEEP BITES

143 CLEAN windows would be exactly the shape of a check that looks at nothing,
so `--neuter` is passed straight to `tracePort`. One window, seed 1900
(camera `$0319`), which is CLEAN unbroken:

| neuter | verdict |
|---|---|
| *(none)* | CLEAN |
| `seed-x+1` | **DIVERGED, 43 fields**, first f1901 `w_0212 port 35 rom 99` |
| `seed-nosub` | **DIVERGED, 153 fields**, first f1901 `w_034D port 0 rom 128` |
| `laginject=1930` | **DIVERGED, 383 fields**, first f1930 `w_000E port 1 rom 15` |
| `seed-nt+1` | **SCREEN, nt 1/2048** |
| `seed-pal+1` | **SCREEN, pal 1/32** |
| `seed-coll0` | **SCREEN, coll 65/512** |
| `seed-oam0` | CLEAN - *invisible, and expected*: `$8087`'s DMA rewrites all 256 bytes from the shadow before anything reads them (wave 10 measured and documented this) |
| `lead1` | CLEAN **on this window only** - see below |
| `bullet-nosub` | CLEAN - no live enemy-bullet slot in this window |

`lead1` deserves the extra line because a CLEAN there would otherwise look like a
hole. The input lead is invisible on a window where the buttons do not change,
and this script holds one direction for 1350 frames at a time. Measured on the
three windows that CONTAIN a button change:

```
lead1 @1720   DIVERGED 296 fields, first f1750  (the RDA -> RUA switch)
lead1 @2020   DIVERGED  85 fields, first f2074  (RUA -> RDA)
lead1 @2140   DIVERGED 190 fields, first f2154  (RDA -> RA)
clean @1720   CLEAN
```

Six of nine neuters red on a single window, and the three that are not each have
a measured reason rather than a shrug.

**What I did NOT do: source-level breaks.** This round is a READER role and
`games/gradius/src/` is not mine to edit even temporarily. The harness-level
neuters above are what I can honestly claim.

---

## PART 3 - THE MAP OF THE STAGE

```
node games/gradius/tools/oracle/sweep.mjs --window 60
```

### POWERED - 143 windows, every one of them inside game mode 5

| scroll band | frames | windows | what the port does |
|---|---|---|---|
| **`$002B`-`$0427`** | f400-2440 | **34** | **CLEAN** - 1022 fields, the screen, the palette, the OAM and the collision map all exact on every frame |
| `$0427`-`$058F` | f2440-3160 | 12 | THREW **`$B6E1`** (entry 7, type `$07`/`$87`) - first at f2490 |
| `$058F`-`$05CB` | f3160-3280 | 2 | THREW **`$AF2E`** (entry 15, type `$8F`) |
| `$05CB`-`$0607` | f3280-3400 | 2 | THREW `$B6E1` |
| `$0607`-`$0625` | f3400-3460 | 1 | THREW **`$B747`** (entry 19, type `$93`) |
| `$0625`-`$076F` | f3460-4120 | 11 | THREW `$B6E1` |
| `$076F`-`$07C9` | f4120-4300 | 3 | THREW **`$B311`** (entry 9, type `$89`) |
| `$07C9`-`$0841` | f4300-4540 | 4 | THREW `$AF2E` |
| `$0841`-`$089B` | f4540-4720 | 3 | CLEAN (the pool has just been cleared) |
| `$089B`-`$0A03` | f4720-5440 | 12 | THREW `$B747` |
| `$0A03`-`$0A64` | f5440-5680 | 4 | THREW `$AF2E` - and the CARTRIDGE dies at f5514, scroll `$0A28` |
| `$0807`-`$0861` | f5680-5860 | 3 | THREW **`$A19E`** (the missile CRAWL, `src/weapons.js`) |
| … | f5860-8980 | 46 | the same three bands again, twice more: the checkpoint is `$0800` and the run loops `$0800`→`$0A60` |

```
  --- powered: 143 windows, 2700 graded frames
      CLEAN     42
      SCREEN    0
      DIVERGED  0
      THREW     101
      SEED-REFUSED 0
      windows entirely in game mode 5: 143  (CLEAN 42, DIVERGED 0, THREW 101)
      first non-CLEAN window: seed 2440, scroll $0427
      distinct ROM addresses thrown: 5
        $B747  46 window(s), first seed 3400   entry 19, type $93
        $B6E1  25 window(s), first seed 2440   entry  7, type $07
        $AF2E  18 window(s), first seed 3160   entry 15, type $8F
        $A19E   9 window(s), first seed 5680   the missile crawl
        $B311   3 window(s), first seed 4120   entry  9, type $89
```

### UNPOWERED - the same wall, then game over, then the attract demo

| scroll band | frames | windows | verdict |
|---|---|---|---|
| `$002B`-`$0427` | f400-2440 | 34 | CLEAN |
| `$0427`-`$04BD` | f2440-4000 | 19 + 6 | THREW `$B6E1`, interleaved with CLEAN windows right after each of THREE deaths (checkpoint `$0400`) |
| `$04BD`-… | f4000-4420 | 7 | THREW **`$96FB`** - GAME OVER (`$1B = $C0`) |
| - (modes 0,1,2) | f4420-8980 | **76** | **DIVERGED** - the title screen and the ATTRACT DEMO |

```
  --- unpowered: 143 windows, 7090 graded frames
      CLEAN 40   DIVERGED 76   THREW 27   SEED-REFUSED 0
      windows entirely in game mode 5: 67  (CLEAN 40, DIVERGED 0, THREW 27)
      windows that leave mode 5: 76  (modes seen 0,1,2)
      first non-CLEAN window: seed 2440, scroll $0427
        $B6E1  20 window(s), first seed 2440
        $96FB   7 window(s), first seed 4000   GAME OVER
```

### A 300-frame window says the same thing, which is the point

60-frame windows re-seed five times a second, and a bug whose first symptom takes
longer than that to reach a watched address would be re-seeded away. So the same
sweep was run with windows FIVE TIMES longer (overlapping, since they no longer
tile - the run says `windows whose END-OF-WINDOW SCREEN was compared: 0 of 143`
rather than pretending):

```
node games/gradius/tools/oracle/sweep.mjs --run powered --window 300
  --- powered: 143 windows, 10852 graded frames
      CLEAN 30   DIVERGED 0   THREW 113   SEED-REFUSED 0
      windows entirely in game mode 5: 143  (CLEAN 30, DIVERGED 0, THREW 113)
      first non-CLEAN window: seed 2200, scroll $03AF
      (the same five ROM addresses; every early window now throws at f2490,
       because 300 frames from $03AF reaches the $0440 record)
```

**10,852 graded frames, still zero divergent fields.** The port's failure mode is
refusal, not drift, and that holds at 5x the window length.

### The three sentences the map is for

1. **Inside game mode 5 the port is EXACT or it STOPS. It is never quietly
   wrong.** 210 windows entirely in mode 5 across both runs, 9790 graded frames:
   **0 DIVERGED**. Every failure is a loud throw carrying a ROM address.
2. **It stops at scroll `$0427`-`$0440`**, and the ROM said so before any of this
   ran: that is where stage 1's first `cmd $03` record spawns type `$07`.
   34 of 143 powered windows are clean and they are all before it.
3. **Outside mode 5 the port is quietly wrong and says nothing.** 76 windows in
   the post-game-over title + attract demo diverge on 300-500 fields each, from
   the first graded frame, with no throw - because `src/nmi.js`'s mode dispatch
   has no `else`. Nothing in this repo had measured that; the gate's corpus is
   entirely inside mode 5.

---

## PART 4 - THE BOSS

Stage 1's boss page is `$0C` (`$9A3D[0]`, read from the ROM) = scroll `$0C00`;
the stage ends at page `$0E` (`$98FD[0]`). At the boss the cartridge sets
`$1B := $9A45[$19] = $81`, which is `jt_982F` entry 1 → `$9A0E` - one of the
**15 of 16** play sub-states the port does not implement.

The `powered` run does NOT get there: it dies at frame 5514 / scroll `$0A28`
(parked at X = 240, Y = 96 with `$44=2 $45=2 $46=5 $41=1` held) and the
checkpoint returns the camera to `$0800`, so the run loops `$0800`→`$0A60`
forever. **That is a fact about the SCRIPT, not about the boss**, and
`bossreach.py` is how I found out which:

```
python games/gradius/tools/oracle/bossreach.py --frames 9000 --switch 5000

  tail  maxScroll  atFrame  deaths  firstDeath  $1B values
    RA      $0A64     5633       3        5514  [0,1,2,3,4,128,160]
   RUA      $0D00     8251       0           -  [0,1,2,3,4,128,129,130,131,132,133]
   RDA      $0991     5211       4        5091  [0,1,2,3,4,128,160,192]
    UA      $0D00     8251       0           -  [0,1,2,3,4,128,129,130,131,132,133]
    DA      $0991     5211       4        5091  [0,1,2,3,4,128,160,192]
     A      $0B04     7209       3        5514  [0,1,2,3,4,128,160]
   zig      $0A68     8376       4        5517  [0,1,2,3,4,128,160,192]
```

**`RUA` and `UA` reach scroll `$0D00` with ZERO deaths and take `$1B` through
`$81 $82 $83 $84 $85`.** The boss IS reachable, by a fixed hold, in 8300 frames.
That became `sweep.py`'s third run, `boss` (measured, not guessed - the comment
in the file says so):

```
python games/gradius/tools/oracle/sweep.py --only boss --frames 9000 --every 60
    script 200:,10:S,190:,1350:RDA,324:RUA,80:RDA,2846:RA,4000:RUA
    max scroll $0D00 at frame 8251; lag drops 1
    dying frames ($1B = $A0): 0; distinct $1B values [0,1,2,3,4,128,129,130,131,132,133]
```

The cartridge's own boss timeline, straight out of the RAM dump:

```
f6300  $1B = $80  scroll $0BB1     ordinary play
f6458  $1B = $81  scroll $0C00     ONE frame -- $9A56 sets it at the boss page
f6459  $1B = $82  scroll $0C00     the BOSS FIGHT, 1280 frames
f7739  $1B = $83  scroll $0C00     one frame
f7740  $1B = $84  scroll $0C00     512 frames, the camera resumes to $0D00
f8252  $1B = $85  scroll $0D00     the end-of-stage chain
```

### The boss half of the map

| scroll band | frames | windows | what the port does |
|---|---|---|---|
| `$0B11`-`$0B6B` | f5980-6160 | 3 | THREW `$B6E1` |
| **`$0B6B`-`$0BE3`** | f6160-6400 | **4** | **CLEAN** - the last unported enemy has died; the port runs the approach to the boss exactly |
| `$0BE3`-`$0C00` | f6400-6460 | 1 | THREW **`$9A56`** at f6457 after 57 clean frames: *"`$3F` reached 12 (>= `$9A3D[0]` = 12), so the cartridge would set `$1B = $81` and start the end-of-stage chain. Not ported."* |
| `$0C00`-`$0C14` | f6460-7780 | 22 | THREW **`$982A`**, `$1B = $82` - **the boss fight itself** |
| `$0C14`-`$0D00` | f7780-8260 | 8 | THREW `$982A`, `$1B = $84` |
| `$0D00` | f8260-8980 | 12 | THREW `$982A`, `$1B = $85` |

```
  --- boss: 143 windows, 2575 graded frames
      CLEAN 41   DIVERGED 0   THREW 102   SEED-REFUSED 0
      windows entirely in game mode 5: 143  (CLEAN 41, DIVERGED 0, THREW 102)
      distinct ROM addresses thrown: 7
        $982A  42 window(s), first seed 6460   $1B = $82/$84/$85
        $B6E1  34   $B747 10   $AF2E 7   $B311 7   $A19E 1
        $9A56   1 window(s), first seed 6400   the boss-page transition
```

**So the boss is not "unreachable" and it is not "unported deep down": it is
42 of 143 windows - 29% of a full playthrough of stage 1 - and the port refuses
every frame of it at two addresses, `$9A56` and `$982A`.** `jt_982F` has 16
entries and the port implements 1; the boss uses `$81`, `$82`, `$83`, `$84`,
`$85`.

---

## What I ruled out

* **"The port diverges as you get further in."** It does not, inside mode 5:
  0 divergent fields in 9790 graded frames over 210 mode-5 windows. What it does
  is REFUSE, loudly, at five distinct ROM addresses.
* **"The sweep is green because it is not looking."** Six of nine harness
  neuters go red on a single window, including all three that only the new
  end-of-window screen check can see.
* **"The unported handlers are a deep-stage problem."** The first one fires at
  scroll `$0440`, which is 4.25 pages into a 14-page stage, roughly 35 seconds in.
* **"`$B6E1` is the next wall" (wave 12).** True but incomplete: it is the FIRST
  of five walls the sweep hits, and it is not the most frequent - `$B747` throws
  in more windows than `$B6E1` does.

## The full command sequence

```
python games/gradius/tools/oracle/stagewaves.py            # the inventory
python games/gradius/tools/oracle/sweep.py --frames 9000 --every 60
python games/gradius/tools/oracle/sweep.py --only boss --frames 9000 --every 60
node   games/gradius/tools/oracle/sweep.mjs --window 60    # powered + unpowered
node   games/gradius/tools/oracle/sweep.mjs --run boss --window 60
node   games/gradius/tools/oracle/sweep.mjs --run powered --window 300
python games/gradius/tools/oracle/bossreach.py --frames 9000 --switch 5000
node   games/gradius/tools/oracle/sweep.mjs --run powered --seed 1900 --neuter seed-x+1
```

Nothing under `games/gradius/src/`, `games/ddpdoj/` or `games/batman/` was
touched. Everything the tools write lands in `tools/oracle/out/sweep/`, which is
gitignored. I did not commit.

## What I could not do

* No source-level breaks (reader role).
* The sweep does not compare `chrOffset`/`sprite0Hit`/scanline-level video state
  per frame - it compares 1022 RAM addresses, the shadow OAM by the display-list
  rule, and the end-of-window screen. `rendergate.py` remains the pixel check.
* Windows are 60 frames. A bug whose first symptom takes longer than 60 frames to
  appear in a watched address would be missed, and re-seeding every 60 frames
  hides exactly that. `--window` is a parameter; a 300-frame window sweep is one
  command and I did not run one.
