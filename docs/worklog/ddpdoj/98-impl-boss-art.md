# 98 -- IMPL: THE BOSS'S BODY ART -- and it is 244 streams, not 58

status: **DONE.**

started / finished: 2026-08-06. wave: 98. role: IMPLEMENTER.
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address is build B.

`[M]` = measured by me, this session, on this tree.

inputs read in full: `96-impl-boss-arrival.md`, `97-OWNER-boss-over-gate.md`,
`81-impl-fighter-mech-art.md`, `41-recon-sprite-art.md`,
`39-OWNER-visible-play-before-sound.md`.

---

## 0. THE HEADLINE

`[M]` **THE BATTLESHIP IS ON THE OWNER'S SCREEN.** Chrome, the working tree over
`http.server`, fire held, `$810424` pinned -- the same labelled intervention
`stage1-sweep`'s own manifest carries. At lf8,152 the page's own status line
reads **`dl 30 drawn 30`, `spr 18/18`, and NO ART names nothing**, and nine
display-list records belong to the boss. `.scratch/w98/w98-boss-9rec.png` is the
picture and §5 says what is in it.

| | before | after |
|---|---:|---:|
| **records lacking art** (W91's tool, 6,500 steps) | **4,071** | **64** |
| distinct streams lacking art | **75** | **16** |
| bundle | 2,198.8 KiB | 2,572.8 KiB (**+374.0**) |
| BOOT | 531.0 KiB | 532.0 KiB (**+1.0**, and not one byte a picture) |

`[M]` **and 30 of the 64 that remain are the NULL stream `$000000`**, which W41
§1.3 already recorded as legitimately absent. The real remainder is **34 records
over 15 streams**, all of them one enemy-bullet animation run at lf2,247..2,261,
none of them the boss's, and §7 sizes it.

**THE PREMISE WAS WRONG IN THE DIRECTION THAT COSTS MOST.** The census said the
boss needed 58 streams. `[M]` **its own tables hold 244**, and §1 is the
derivation. A harvest sized off W96's 559-frame run would have shipped a quarter
of the battleship.

**BAR CONDITIONS: BOTH.** §6.

---

## 1. THE PREMISE, RE-MEASURED -- three figures confirmed, two corrected

`[M]` I grepped `src/`, `tools/` and the worklogs before disassembling anything,
and I ran the census BEFORE touching a line.

### 1.1 THE BRIEF'S 4,071 OVER 75 STREAMS -- CONFIRMED TO THE RECORD

```
[M] node .scratch/w98/noart.mjs   (W91's tool, unchanged, 6,500 steps)
[M] records 525574  drawn 521503  NO ART 4071  distinct missing 75
```

`[M]` and `node --test games/ddpdoj/tests/` was **1,200 pass, 0 fail** before a
line was written.

### 1.2 "THE BOSS'S ART" IS **244 STREAMS**, NOT 58

`[M]` the six windows the cartridge itself pins, walked out of `maincpu.bin`:

| table | what it is | entries | distinct | W96 drew |
|---|---|---:|---:|---:|
| `$292A88` | OBJECT 0, the LEFT part, by `($2A,A6)` | 32 | 32 | 4 |
| `$292B7A` | OBJECT 1, the RIGHT part, by `($6A,A6)` | 32 | 32 | 4 |
| `$292C2A` | OBJECT 3, 15 rows of `$20` | 120 | 120 | 7 |
| `$292E32` | OBJECT 4 (`$292E10` can only read [0]) | 3 | 3 | 1 |
| `$292ECA` | OBJECT 5, by `(byte & $3E)*2` | 32 | 32 | 17 |
| `$292F84` | **OBJECT 6, THE HULL**, 12-byte records | 24 | 24 | 24 |
| `$292952` | OBJECT 2, an IMMEDIATE | 1 | 1 | 1 |
| | | | **244** | **58** |

**58 is what a 559-frame life happens to index.** The boss's five animation
cursors -- `($2A,A6)`, `($6A,A6)`, `($AC,A6)`, `($C6,A6)` and `($11A,A6)` --
each sweep their whole table over a fight that runs to the end, and W96's port
stops 559 frames in on `$29540C`. **This is W81 §1.1 from the other side**: that
wave was told 57 and found 2; this one was told 58 and found 244. In both cases
the number that was wrong came from a RUN and the number that was right came
from an INDEX.

**AND EVERY ONE OF THE SIX WAS ALREADY A DECLARED ROM WINDOW** -- W82 exported
OBJECT 3/4/5's and W96 exported OBJECT 0/1/6's, `check_boss_arrival_tables`
asserts five of them against each other on every export. **This wave adds no new
reading of the cartridge at all**; it ships the pictures the windows already
name. `[M]` I re-derived every far end here rather than take it: `$292932[1]`,
`[3]`, `[4]`, `[5]`, `[6]` and `$292710`'s `lea` publish all six, and
`tests/w98bossart.test.js W98/1` asserts each, with `[M]` all twelve
off-by-one perturbations (six tables x +-1) failing on the far-end pin
(`.scratch/w98/redval1.mjs`).

### 1.3 TWO TABLES INSIDE THE BOSS'S OWN WINDOWS ARE **NOT ART**

Both are called "sprite table" in this repo's own comments and neither is one.

```
[M] $292A08   32 longwords: $40004000 $48004800 .. $C000C000
              -- 17 distinct, every one the SAME WORD TWICE, written to
                 ($46,A6) by $2929AA/$292B40.  NOT stream starts.
[M] $292F84   the SECOND longword of each 12-byte record: $E600EE00 (x12)
              and $E000E500 (x12).  Only `(A2)` is a picture.
```

`[M]` harvesting either would have thrown at export (`romExtent` refuses), which
is the guard working -- but it would also have been an hour of reading a
`SpriteDirError` for a reason that is written down here instead. `W98/2` asserts
both out of the cartridge, and `[M]` reading `$292F84` at stride 4 instead of
`$10` drives it red alone.

### 1.4 **THE SINGLE LARGEST MISSING STREAM IS NOT THE BOSS'S**

`[M]` `$07E8AC`, **523 records**, first needed lf7,521 -- larger than any of the
boss's, and `12.8 %` of the entire 4,071.

```
[M] $29709E  move.l #$7E8AC,D2   <- a LITERAL, handlers.js emit24, type $24
[M] $2970BA  move.l (A0,D0.w),D2 <- $2970D8, HARVESTED INTO SHARD 4 SINCE W47
```

**Type `$24` emits two records per frame from one routine, and only the second
one had a picture.** The table shipped; the immediate three instructions above
it did not. It is W81 §1.1's immediate-vs-table lesson a third time, it costs
6.0 KiB, and it goes in **shard 4 beside its own table**, not in the boss shard.

### 1.5 TWO FIGURES IN THE BRIEF THAT DO NOT REPRODUCE

* **`seedcmp` bucket 2 is 66,272 records, not 54,280.** `[M]` `pgm.py check`'s
  own sweep row on this tree: `15 green, 27 red, 29 blocked -- 13,084 logic
  frames`, `BUCKET 2: 66,272 record(s) ... 876 MISSING`. **That is W96 §5.1's
  AFTER figure exactly.** 54,280 is W95's BEFORE figure; `97-OWNER` §"WHAT THIS
  DOES NOT CHANGE" carries it as the current one and the brief repeated it.
  Nothing on the ladder moved in this wave and nothing could: **no file under
  `src/` was touched.**
* `[M]` **the boss's HULL is drawn OFF THE TOP OF THE SCREEN, and the BOARD
  DOES THE SAME.** §5.3. That is a question this wave was able to answer only
  because the art now exists.

### 1.6 THREE THINGS I CHECKED AND FOUND TRUE

* `[M]` `$292952` really is `move.l #$6539C,D2` and OBJECT 2 really has been
  ported since W82 (`src/boss.js:788`) -- it was invisible because nothing had
  ever armed the OBJECT slots, exactly as W96 §6.1 said.
* `[M]` the boss really does write bucket 7 for OBJECT 6 and bucket 2 for the
  parts, and the parts really are the records the page draws.
* `[M]` `assets/` really is gitignored (`.gitignore:22`), so nothing
  ROM-derived is committed by any of this.

---

## 2. WHAT SHIPPED

`tools/export-web.mjs` only. **NO FILE UNDER `src/` WAS TOUCHED**, which is why
`seedcmp`, `playgate` and every logic gate are arithmetically incapable of
moving.

* **six `HARVEST` rows** for `$292A88`, `$292B7A`, `$292C2A`, `$292E32`,
  `$292ECA` and `$292F84`, all in a new **shard 17 `boss`**.
* **two `W81_IMMEDIATES` rows**: `$06539C` (shard 17) and `$07E8AC` (**shard
  4**).
* `SPR_SHARDS[17]` and `SPR_ORDER` gaining `17` at the END.
* `tests/w98bossart.test.js` -- **new**, 7 tests.
* `tools/w98bossartgate.mjs` -- **new**, §4.
* `tests/w52weapons.test.js` -- the `SPR_ORDER` literal, §2.2.

### 2.1 `$292F84`'s RUN CANNOT SIZE IT, AND THE ROW SAYS SO

`checkTableExtent` demands the cartridge's own run of consecutive stream starts,
and for five of the six it agrees with the index entry for entry. `[M]` the
sixth does not:

```
[M] $292F84 at stride $10: the run of longwords that pass as stream starts
[M]   is 29, not 24, ending at $293154.  Entries 24..28 land inside $293104
[M]   -- THE MAIN SCRIPT TABLE -- whose {init,step} pointers happen to decode
[M]   as stream starts.
```

So the row declares `entries 24, runsTo 29, endsAt $293154` and the `why` names
`$292710 lea $293104,A0` as what actually pins 24. **That is `$272E7A`'s shape
exactly** -- its run of 160 walks through two other types' tables and the INDEX
is what stops it -- and it is the honest form: the run is stated as measured and
is not pretended to be the pin.

### 2.2 THE ORDER, AND THIS IS THE FIRST SHARD WHOSE DEADLINE IS *LATE*

`[M]` shard 17's first record lands at **lf8,144 = 137.6 s** from the seed at
59.185606 Hz. The latest deadline anything else in this bundle has is shard 11's
**+5.3 s**. It is also the **largest body in the bundle** at 367.0 KiB against
shard 11's 322.5. So it goes **LAST**, and `tests/w52weapons.test.js`'s
ORDER-IS-A-CLAIM loop gains the mirror of its own assertion: every other shard
must precede it. `[M]` taking `17` out of `SPR_ORDER` drives `W98/7` red.

`demand()` still promotes it the moment a record asks, as it has since W47, and
until it lands the page NAMES it rather than drawing pen 0.

### 2.3 **NO SEVENTH `PUBLISH_VERBATIM` ENTRY IS NEEDED**

`[M]` `node tools/publish.mjs --only ddpdoj --dry` -- **GREEN**, `dist/ built:
262 files, 7108 KB`, and the ROM-leak guard reports **`clean, 6 deliberate
exception(s)`**, the same six. **Neither `col.shard17` nor the regrown
`col.shard4` is a verbatim slice**: 244 streams drawn from six tables scattered
over `$065xxx..$093xxx` stitch into a buffer that matches nothing contiguous in
any mask ROM. W81 §7 had to stop and ask the owner; this wave did not, and the
reason is a property of the data rather than a judgement.

`build-dist.mjs`, `publish.mjs`, `bundlegate`, `webgate` and the guard are
UNTOUCHED.

---

## 3. THE RESULT

### 3.1 The census, before and after

```
[M] BEFORE  records 525574  drawn 521503  NO ART 4071  distinct missing 75
[M] AFTER   records 525574  drawn 525510  NO ART   64  distinct missing 16
```

**The record count is IDENTICAL, 525,574 both times.** The port emits exactly
what it emitted; 4,007 more of them now have a picture. That is what says this
is an export wave and not a code change wearing one.

The 16 that remain, in full:

| stream(s) | records | what it is |
|---|---:|---|
| `$000000` | 30 | the NULL stream. W41 §1.3: legitimately absent |
| `$1C167C`..`$1C1874`, 15 streams stride `$24` | 34 | §7 |

### 3.2 The bundle

```
[M]              total        BOOT        deferred     spr shards
[M]  before   2,198.8 KiB   531.0 KiB   1,667.8 KiB       17
[M]  after    2,572.8 KiB   532.0 KiB   2,040.8 KiB       18
[M]  delta      +374.0        +1.0        +373.0          +1
```

`[M]` **ALL 374 KiB is DEFERRED and BOOT grows 1.0 KiB, none of it a picture**:
`manifest.json` 13,121 -> 14,095 B (served UNCOMPRESSED, so every character of
the new `why` strings and six harvest rows is a boot byte) plus
`spr/streams.u32.gz` 1,255 -> 1,316 B for 245 more streams. **What the page
waits for is unchanged: shard 0 and BG shards 0-1.** Shard 0 is byte-identical
(39.2 KiB, 166 streams), which is what keeps `capture.bin` and `bundlegate`
still.

Per shard: `17 boss 244 streams mask 38,827 + col 336,943 = 367.0 KiB`;
`4 type24 16 -> 17 streams, 23.9 -> 29.9 KiB`.

---

## 4. THE ORACLE -- `tools/w98bossartgate.mjs`

**THE EMISSION GATE CANNOT ANSWER THIS QUESTION.** `w80emitgate.mjs` compares
per-type RECORD COUNTS, and W81 §6 already said what that cannot see: never the
pixels and never the bucket. For an art wave the count is not the claim. The
claim is *the address at the end of the record resolves to a picture*, and the
only unimpeachable source for the set of addresses is the cartridge on the
board.

So: read the **BOARD's own display list** out of W69's 72 checkpoints (a
checkpoint is the whole of main RAM, and `$800000..$8009FF` is the hardware list
the board had just emitted), decode it with `boarddl.mjs readCheckpoint` -- the
ROM's own arithmetic, whose three `--break` mutations are its own red validation
-- and look every descriptor up in the shipped sheet.

```
[M] node games/ddpdoj/tools/w98bossartgate.mjs
[M]   the BOARD's own display list: 5783 entries over 651 distinct streams
[M]   the shipped sheet holds 2411 streams
[M]   THE BOSS'S SIX TABLES + $292952: 244 streams, the bundle holds 244
[M]   the BOARD draws 55 of them over 336 display-list entries
[M]   W98 BOARD ART: ok
```

### 4.1 **AND IT WAS SEEN TO FAIL, THREE WAYS**

```
[M] --break no-boss-shard       55 OF THE BOSS'S STREAMS MISSING
[M]                             (336 of 336 board entries), exit 1
[M] --break boot-shard-only     55 MISSING, exit 1   -- the control
[M] --break no-type24-immediate ok for the boss, and the board-wide figure
[M]                             moves 118 -> 119 streams / 440 -> 442 entries
```

`no-boss-shard` **is the bundle exactly as it shipped at W96**, so the red is
not hypothetical: it is the state the owner was in this morning.
`no-type24-immediate` is the mutation that must NOT move the boss's verdict and
MUST move the board-wide one, which is what stops the two numbers being one
number wearing two names.

### 4.2 A DEFECT THIS GATE CAUGHT IN ITSELF, AND IT WAS GREEN ON NOTHING

`[M]` the first draft's `shardOf` keyed off `colFrom`/`colLen`. Column 1 of the
stream table is the packed **MASK** base (`src/web/assets.js:359`
`shardOfBase`), so every lookup returned -1, **every `--break` became a no-op
and the gate reported `ok` with an empty sheet**. It was caught by
`--break no-boss-shard` failing to go red -- i.e. by the red validation, on its
first use, before anything rested on it. `W98/6`'s `boot-shard-only` control is
kept for exactly that reason and the reason is written above the function.

### 4.3 WHAT THIS GATE DOES NOT SAY, PLAINLY

* **It is ONE-DIRECTIONAL.** It can prove the sheet is SHORT. It cannot prove a
  stream we ship is the RIGHT picture and it compares no pixel. Nothing in this
  repo compares an enemy sprite's pixels against the board's; W81 §6 said so and
  it is still true.
* **A stream the board never reaches in these 72 rungs is invisible to it.**
  `[M]` the board draws 55 of the boss's 244 over this ladder -- the ladder is
  72 sparse instants, not a fight -- which is precisely why the harvest is sized
  off the ROM TABLES and not off this report.
* **118 of the board's 651 streams are still absent** (440 of 5,783 entries).
  They are the `$1Cxxxx` bullet and `$22Axxx` effect families, they predate this
  wave, and they are **REPORTED and not asserted** so that the gate says
  something true about the thing it is for. §7.

---

## 5. **THE PAGE, OPENED, AND WHAT THE BATTLESHIP LOOKS LIKE**

`[M]` `python .scratch/w98/bossshot.py 8988 240` -- the working tree over
`http.server`, real Chrome (`channel='chrome'`, headed, driven by the
`playwright` package already installed; nothing was downloaded), fire HELD and
`$810424` pinned to `$FF`. That is the SAME labelled intervention
`stage1-sweep`'s manifest carries (`docs/knowledge/09`), and without it a
scripted flight dies long before lf7,860. **The server is shut down in a
`finally`; `[M]` nothing is left listening on 8988, 8989, 8990 or 8991, and
`[M]` every `chrome.exe` alive afterwards descends from the owner's own browser
(PID 36512, the default user-data-dir), not from playwright.**

```
[M] lf7,892  MAIN NONE  1 boss record   dl 33 drawn 33  spr 18/18
[M] lf8,152  MAIN 5     9 boss records  dl 30 drawn 30  spr 18/18
[M] lf8,518  STOPPED    UNPORTED $29540C   dl 89 drawn 89
```

**`drawn` EQUALS `dl` ON EVERY SAMPLE AND `NO ART` NAMES NOTHING**, where W96's
own status line at the same instant read `NO ART 9: $07E538x2 $06D888x1
$066008x1`.

### 5.1 THE NINE RECORDS AT lf8,152, AND WHAT THEY ARE

```
[M] $06539C 208x96 pal19 x=224 y=74     OBJECT 2 -- THE CENTRAL HULL
[M] $06D100 160x96 pal21 x=235 y=137    OBJECT 0 -- the LEFT pod
[M] $065880 160x96 pal21 x=236 y=12     OBJECT 1 -- the RIGHT pod
[M] $079060  80x64 pal22 x=160 y=90     OBJECT 3
[M] $07E160  32x32 pal21 x=256 y=106    OBJECT 4
[M] $07E56C  32x24 pal23  x4            OBJECT 5, four limb joints
```

**WHAT IT LOOKS LIKE.** A huge armoured battleship filling the top third of the
playfield. A dark navy-and-cyan central hull with a bright blue armoured
superstructure and twin barrels at its nose; **two enormous grey steel side pods
flanking it**, each with a big circular turret disc, a brown gun barrel and
white finned housings; green and steel deck plating behind. It is firing a dense
spread of pink ringed bullets straight down the screen while the player's orange
laser plume burns into its underside. `.scratch/w98/w98-boss-9rec.png`.

### 5.2 CROPPED AT THE RECORDS' OWN COORDINATES, NOT BY EYE

W81 §5's lesson in its own words: *"Cropping by eye on a screen that still has
missing background art on it is how you diagnose the wrong subsystem."* So the
crop is arithmetic: the port's own `$800000` entry gives `long`, `short`, size
and palette, `rotateCCW` maps board `(x, y)` to canvas `(col = y, row = 447 -
x)`, and `.scratch/w98/bossshot.py` crops there. `[M]`
`w98-9rec-crop0-06D100.png` -- the box `$06D100`'s own record names -- is **a
grey armoured pod with a circular rotor turret, a brown gun barrel and white
steel fins**, i.e. the boss's left part, at the coordinates the port put it.

### 5.3 **THE HULL IS OFF THE TOP OF THE SCREEN, AND THE BOARD PUTS IT THERE TOO**

`[M]` OBJECT 6's frame 0 `$084800` (208x144) is emitted by the port at long-axis
**x = 464** on a 448-pixel screen -- entirely above the visible area -- for the
whole descent.

**That is not a defect.** `[M]` `node .scratch/w98/hull.mjs` reads the BOARD's
own display list over the same window:

```
[M] lf8,250  BOARD: $84800 @ x=464, y=-106, 208x144
```

**The cartridge emits the same record at the same long axis.** So the descent's
hull sprite is authentically off-screen at this point, the art ships and is
correct in the sheet (the board draws it), and what the player sees during
MAIN 0 is not the hull. W96 §6.2.2 recorded that the ladder is structurally
blind to bucket 7; this is the first measurement of what is in it, and it took
the art existing to be able to ask.

---

## 6. THE BAR -- WHICH CONDITIONS I DELIVERED

### 6.1 FEATURE COMPLETE -- **YES, FOR THE BOSS'S PICTURE.**

`[M]` I opened the page in a real browser, reached the boss, and photographed
it. §5. The owner's test for this wave was *"reach the boss and SEE the
battleship"*, and it is there, in colour, at the coordinates the port's own
display list gives.

**It is NOT the whole of `39-OWNER`'s condition 1** and must not be read as one:
`capture.bin` still ships, the HUD on screen is still the recording's, nine
sprite palette banks are still the recording's, and the run still stops at
`$29540C` 559 frames into the fight.

### 6.2 ORACLES PERFECTLY -- **YES, against the BOARD, and seen to fail three ways.**

§4. `[M]` all 244 of the boss's streams present; all 55 the BOARD draws over the
`stage1-sweep` ladder resolve to a picture across 336 of its own display-list
entries; `--break no-boss-shard` (the W96 bundle) and `--break boot-shard-only`
both exit 1; `--break no-type24-immediate` moves the board-wide figure and not
the boss's. **And the instrument was caught being green on nothing by its own
red validation before anything rested on it** (§4.2).

`[M]` the seven tests in `tests/w98bossart.test.js` were each seen red:
W98/1 under all twelve off-by-one table perturbations, W98/2 with `$292F84`
read at stride 4, W98/3 with `$7E8AC` moved out of shard 4, W98/7 with `17`
moved out of `SPR_ORDER`, and W98/4-6 under `no-boss-shard`.

### 6.3 THE NUMBERS THE BRIEF SET

| | required | `[M]` measured |
|---|---|---|
| unit tests | 1,200 pass / 0 fail | **1,207 pass / 0 fail** (+7, `w98bossart`) |
| `pgm.py check` | 71/3, no fourth | **71 passed, 3 failed** -- `STAGE 1 ENDS`, `THE LASER BOMB`, `segment sweep`. **The same three. No fourth.** |
| `seedcmp stage1-sweep` | must not degrade | **15 green / 27 red / 29 blocked / 13,084 frames**, bucket 2 66,272 records / 876 MISSING -- **byte-identical to W96 §5.1, and it CANNOT have moved: no `src/` file was touched** |
| `webgate` | GREEN 30 | **30 PASS, 0 FAIL**, exit 0 |
| `publish.mjs --only ddpdoj --dry` | GREEN | **GREEN**, 262 files / 7,108 KB, leak guard clean with the **same six** exceptions |
| records lacking art | move it | **4,071 -> 64** |

**On the three reds, and I read each gate file's own header before classifying
it** (`97-OWNER`'s correction):

* `STAGE 1 ENDS` -- `w62stageendgate.mjs`'s header says in terms *"IT IS
  PORT-VS-LISTING, NOT A BOARD COMPARISON"*. **Not board-carrying.** Red by
  OWNER DECISION (`97-OWNER`), untouched by this wave.
* `THE LASER BOMB` -- known since W80.
* `segment sweep` -- expected while any rung blocks.

---

## 7. WHAT IS LEFT, WITH ITS SIZE

1. **34 RECORDS, 15 STREAMS, AND THEY ARE NOT THE BOSS'S.** `[M]`
   `$1C167C..$1C1874`, stride `$24`, first needed lf2,247. `[M]` the base of the
   run, `$1C1658`, appears in the image at `$281FBC` -- **the bullet code** --
   so this is shard 7's enemy-bullet chain falling 15 entries short at one end.
   It is the whole of the non-null remainder and it is one range bound.
2. **118 OF THE BOARD'S 651 STREAMS ARE STILL ABSENT** (§4.3), 440 of 5,783
   display-list entries. The `$1Cxxxx` bullets, the `$22Axxx` effects and
   `$1BCxxxx`. Item 1 is a subset of this. **`w98bossartgate.mjs` is now the
   instrument that can size that wave**, which it could not be before.
3. **NOTHING COMPARES THE BOSS'S PIXELS AGAINST THE BOARD'S.** §4.3.
4. **`$29540C`.** The page still stops 559 frames into the fight.

---

## 8. NOT TOUCHED

**Every file under `src/`.** `publish.mjs`, `bundlegate`, `webgate`,
`build-dist.mjs`, the ROM leak guard, `PUBLISH_VERBATIM` (still six entries; **no
seventh is needed**, §2.3), `boarddl.mjs`, `NOTICE.md`, `CONTRIBUTING.md`,
`games/gradius/`, `games/batman/`. Nothing ROM-derived is committed --
`[M]` `git check-ignore` confirms `games/ddpdoj/assets/` is ignored at
`.gitignore:22`. Scratch output is in `.scratch/w98/`, gitignored.
`docs/worklog/ddpdoj/101-PLAN-*.md` appeared in the tree during this session and
is **not mine and not staged**.
