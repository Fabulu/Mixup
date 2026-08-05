# 68 — DIAG: the invisible collidables, and what "drawn% 100 %" does not mean

status: **DONE** — §9 ranks the causes, §10 is the wave list, §8 is the corrected
way to state coverage.

role: DIAGNOSTIC. **READ-ONLY on `games/ddpdoj/`** — T1 is writing `src/`
concurrently. This worklog is the only file I wrote or committed; every probe
lives in the session scratchpad, outside the repo. `games/gradius/` not touched.
**No web server was started** — every browser measurement is against the LIVE
DEPLOYED URL — so none was left running.

target: `ddpdojblk` VERSION-B. Every measurement is against **the live build
`20260805170024`**: either `dist/games/ddpdoj/` (the exact published tree, run
headless) or `https://gbtman.pages.dev/games/ddpdoj/` driven in Chrome. Nothing
was measured against the working tree, deliberately.

`[M]` = measured by me, this session. Anything from another document is marked
`[cited]` and named.

brief: the owner, playing the live build —

> "also my shots seem to hit invisible things"

and, mid-audit —

> "particularly after killing the first boss, more and more invisible stuff
> shows up, some invisible enemies, some terrain starts being black after the
> golden terrain, some tanks are on the golden terrain but also invisible stuff
> that gets hit. Sometimes with hit sparks, sometimes not, but no splosions."

and —

> "the blades that draw are only a background element. Funny thing is that boss
> part of background element is also missing."

---

## 0. THE HEADLINE, IN THREE NUMBERS

**1. The owner's shots are hitting five enemy types whose handler tail is an
unported counted note.** `[M]` Over 7,000 logic frames of a playing run:

| what | `[M]` |
|---|---|
| collidable sub-record slot-frames (the game's own `$244F90 andi #$2000` test over the 150 slots of `$81459C`/`$81521C`) | **100,783** |
| ...that became a display-list record | **49,978 (49.6 %)** |
| ...that did **not** | **50,804 (50.4 %)** |
| spawned enemy objects whose TYPE never emits a record at all | **141 of 295 (47.8 %)** |

**2. "drawn% 100.0 %, ZERO missing streams" is an artefact of the window.**
`[M]` E3/E6's own input, verbatim, on the live build:

```
[M] at 2,600 frames   119,556 records  119,556 drawn  100.00 %   0 missing streams
[M] at 4,000 frames   207,779 records  202,175 drawn   97.30 %  26 missing streams
[M] at 5,000 frames   262,378 records  251,381 drawn   95.81 %  62 missing streams
[M] at 7,000 frames   319,035 records  305,024 drawn   95.61 %  63 missing streams
```

Same code, same bundle, **same input** — only the run length changed. W66's
figure reproduces to the record and stops being true 1,400 frames later.

**3. The black terrain is not the background.** `[M]` With all eight BG shards
installed, the port's own BG map is **100.00 % covered by the shipped tile sheet
on all fourteen bins of a 7,000-step run — 512,000 map entries per bin, ZERO
orphan tiles.** The black is missing **background-ELEMENT SPRITE art** in
buckets 2 and 3, whose drawn% collapses `100 → 85 → 26 → 0` over the same window.

---

## 1. THE BRIEF'S PREMISE, CHECKED — right in shape, wrong in mechanism

| the brief says | `[M]` verdict |
|---|---|
| objects the port simulates but never emits a record for are invisible AND absent from the drawn/missing denominator | **TRUE, and it is the owner's report.** §2 enumerates them |
| recon 40's "24 of 30 buckets have ROM producers; the port fills 11" | `[cited: W40 §2, W55 §3.2]`. **`[M]` 25 of 30 have ROM producers; the port fills 14** (§3). The figure has now moved 2 → 8 → 11 → 14 |
| "those buckets' objects are exactly what the owner's shots are hitting" | **FALSE, and this is the correction.** `[M]` The invisible collidables are **not** in unfilled buckets. They belong to buckets **7 and 3, which the port fills 100 % and 93.8 % of the time.** The gap is not a missing bucket — it is a missing THIRTY INSTRUCTIONS inside five handlers the port already runs (§2) |
| the cause is "unported producers" | **HALF.** The producer (the enqueue stub) is ported and running; what is unported is the block that CALLS it. That distinction is what makes the fix cheap |

**The brief's premise is therefore checked and partly refused.** Bucket coverage
is the wrong instrument for this report; per-OBJECT emission is the right one,
and §2 is the first time this project has measured it.

---

## 2. WHICH COLLIDABLE OBJECTS EMIT NO SPRITE RECORD

### 2.1 The instrument, and why it is the game's own test

A collidable object in this game is a **sub-record**: a `$20`-byte slot in pool A
(`$81459C`, 100 slots) or pool B (`$81521C`, 50), allocated by `$2635B2` and
walked by the collision pass `$244F68`/`$24507A`. The same `$20` bytes are BOTH
the collision box AND the sprite record — `+$0A`/`+$0C` the descriptor, `+$0E`
the size, `+$10..$16` the hit half-extents, `+$18` the HP.

`[M]` My test is the ROM's, instruction for instruction:

* **live** — `(word0 & $8000)`, `$244F8C bmi`
* **collidable** — `(word0 & $2000)`, `$244F90 andi.w #$2000,D0 / beq`
* **carries a sprite** — `+$0A/+$0C` non-zero AND `+$0E`'s width and height both
  non-zero (`$23D78E move.w $E(A6)`; `SpriteDrawer.draw` returns on either being 0)
* **emitted** — the frame's own `$800000..$8009FF` list, parsed by the port's own
  `parseSpriteList(words, RAM_STRIDE)`, contains a record with that `offs`

**THE ONE THING THIS OVER-COUNTS, CORRECTED BEFORE IT REACHED THE HEADLINE.**
An object owning a run of `runLen+1` slots uses the extra ones as PURE HITBOXES;
they carry neither descriptor nor size. My first pass counted them and reported
the midboss as 8,668 slot-frames invisible, over 77 "descriptors" like `$001003`
and `$010000` which are not stream addresses at all. **The midboss draws and is
not in the finding.** The size filter removes it; it is recorded here so nobody
re-finds it.

### 2.2 THE ENUMERATION — `[M]` 7,000 logic frames, playing input, live build

```
type/handler       spawns  coll-sf  emitted  INVISIBLE  no-art  hitbox-only  invis%
$82/$2747C6            21    19460        0       9730       0         9730   100.0
$07/$26A2E2            43     3886       68       3818       0            0    98.3
$05/$269CEA            25     2848        0       2848       0            0   100.0
$27/$26A2E2             4      412        0        412       0            0   100.0
--- and three whose SPRITE POINTER IS NEVER WRITTEN, so the slot is empty ---
$10/$268232            22     6679        0          0       0         6679      --
$8B/$27687E            25     3636        0          0       0         3636      --
$0E/$292902 (boss)      1     2445        0          0       0         2445      --
--- for contrast, the ones that work ---
$11/$2688CC            90    42221    42221          0       0            0     0.0
$0D/$26B6FA (midboss)   1     8668     1436*         0       0         7232      --
$80/$2739C0             6     4292     2146          0       0         2146     0.0
$89/$27733E             7     1234     1234          0       0            0     0.0
$0B/$26AD28            11     1006     1006          0       0            0     0.0
$08/$26A5E4            10      898      898          0       0            0     0.0
$09/$26A860             7      868      868          0       0            0     0.0
$88/$275F30             3      844      844          0     844            0     0.0
$85/$275914             2     1386      693          0       0          693     0.0
```

`*` the midboss's 1,436 are the four garbage "descriptors" of §2.1 — a
measurement artefact, not a finding.

### 2.3 WHY — the ROM says it, and so does the port's own source

`[M]` I swept `$200000..$2B0000` for every `addi.w #$C,$80AFxx` (160 enqueue
stubs) and every `jsr`/`jmp` absolute-long and `bsr` caller of each (664 sites),
then attributed each site to the nearest preceding handler head out of the 111
distinct handlers in `$267824`/`$27E412`:

| type | handler | its enqueue sites, from the ROM | where they live in the port |
|---|---|---|---|
| `$05` `$25` | `$269CEA` | `$269E16`, `$269E3E` → `$23D852`, **bucket 7** | inside `$269D84..$269E1C`, which `handlers.js:817` replaces with `u?.note(0x2417de, '$05 fire/state machine')` |
| `$07` `$27` | `$26A2E2` | the same two (its span `$269B3E..$26A4B0` contains them) | the same note |
| `$82` | `$2747C6` | `$274A28` → `$23DBCA` **bucket 7**, `$274A4A` → `$23DF86` **bucket 7**, `$274A7E` → `$23DF58` **bucket 3** | inside `$2747FA..$274B64`, which `handlers.js:897` replaces with `u?.note(0x2747c6, '$82 fire/state machine')` |
| `$10` | `$268232` | none by direct call (it emits through an indirect `jsr (A0)`) | `$2682F8..$268490` is a note |
| `$8B` | `$27687E` | none by direct call | its tail is a note |

**AND THE PORT SAYS SO IN ITS OWN WORDS.** `src/handlers.js:1722-1726`,
written at W36 and still true:

> *"NOTE WHAT THIS DOES **NOT** TOUCH. `$269CEA`/`$26A2E2` (types `$05`/`$07`/
> `$27`, **92 of the 339 records**) still `note()` their fire machine at
> `$269D84..$269E1C` and therefore **never reach either block**. Wiring them is
> thirty instructions and it is deliberately NOT part of this wave."*

`[M]` The port's own counted-note log over those 7,000 frames:

```
[M] 13,522 x $2747C6   $82 fire/state machine $2747FA..$274B64
[M] 13,807 x $268232   $10 fire/state machine $2682F8..$268490
[M]  7,665 x $2417DE   $07/$27 fire/state machine $269D84..
[M]    213 x $274AF0   $82's DEATH ARM -- "the enemy therefore stays alive with
                       negative HP instead of dying"
```

**THE DRAW AND THE FIRE ARE THE SAME BLOCK.** These enemies aim, shoot and take
damage because the damage branch is ported and runs FIRST; they never draw
because the sprite-table selection is in the tail that is not. That is why the
owner sees bullets coming out of nothing.

### 2.4 THE ART ALREADY EXISTS FOR THREE OF THE FIVE

`[M]` The descriptor each invisible slot carries, checked against the shipped
sheet's own map:

```
[M] $05, $07, $27  ->  $1718F4   ** ALREADY IN THE SHIPPED SHEET **
[M] $82            ->  $1735FC   not in the sheet
```

So types `$05`/`$07`/`$27` — **72 spawned objects, 7,078 invisible collidable
slot-frames** — need **thirty instructions and ZERO new bytes of art.**

---

## 3. THE BUCKET CENSUS, NOW — measured, not cited

### 3.1 The ROM side `[M]`

```
[M] 160 enqueue stubs (`addi.w #$C,$80AFxx`, $200000..$2B0000)
[M] 664 producer call sites (jsr/jmp absolute-long AND bsr) into those stubs
[M]   5 bulk writers (`move.w An,$80AFxx`) -> buckets 20 and 23
[M] BUCKETS WITH >=1 ROM PRODUCER: 25 of 30
      0 1 2 3 4 5 7 8 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 28 29
[M] the five with NONE: 6, 9, 10, 11, 27
```

W55 §3.2 `[cited]` reports 24 of 30 from absolute-long callers alone; adding
`bsr` gives 25. **This is still a LOWER BOUND** — indirect `jsr (A0)` sites are
invisible to it, and type `$11`'s own emit (`$2689C6 jsr (A0)` through
`($2A,A5)`) is exactly one of those, which is why the tank draws while my sweep
finds no direct site for it.

### 3.2 The port side `[M]`

`[M]` 17,533 logic frames of a playing run (the run's honest end is a loud named
throw at `$228658`, stage 2's column stream):

```
[M] UNION over the run: 14 of 30
      0:97571  1:1824  2:18895  3:29688  5:23122  7:15705  14:159259
      15:34730  16:35209  17:525  19:34631  20:25155  21:312  23:61724
```

Bucket 13 is 0 because this run pressed no bomb; W66 `[cited]` measured it live
on a bombing run, so **15 of 30 counting a bomb press.**

**THE FIGURE HAS MOVED 2 → 8 → 11 → 14.** Every wave that quoted it quoted a
number that was already stale.

### 3.3 The ten with a ROM producer and no port record, ever

**4, 8, 12, 18, 22, 24, 25, 26, 28, 29.** Two of them have names now:

* **bucket 25 is THE HUD** — 33 ROM call sites `$28490E..$285FAE`, all into
  `$23FA96`/`$23FAC4`. W11 §6 measured it as the third-largest ablation figure
  (4,472 px) and W40 §7.3 `[cited]` recorded that *"nobody knows what it is"*.
  `[M]` It is `src/hud.js`, and §7 is how it is invisible.
* **bucket 12 is the ship's afterimage trail** `$253604` — W55 §4.3 `[cited]`,
  still open, and `[M]` `7,000 x $253604` in my own note log.

---

## 4. QUANTIFYING WHAT THE OWNER SEES

### 4.1 Collidable versus drawn, per frame `[M]`

Over 7,000 steps: **100,783 collidable slot-frames**, of which **49,978
(49.6 %) became a display-list record.** Per frame that is **14.4 collidable
against 7.1 emitted.**

Splitting the 50,804 that did not:

| | slot-frames | what it is |
|---|---:|---|
| carries a real sprite record, never enqueued | **16,808** | §2 — the five handler tails |
| collidable but the sprite pointer was never written | **12,760** | types `$10`, `$8B`, `$0E` — same cause, one step earlier |
| extra HITBOX slots of objects that DO draw | 21,236 | not a defect (§2.1) |

### 4.2 As a function of time — the owner's "more and more" `[M]`

Per 1,000 steps of the playing run (step i ≈ logic frame 2000+i):

```
  steps        rec     drawn   drawn%   NOART  noart%   distinct-miss
      0      48990     48533    99.1     457     0.9         44
   1000      69260     68767    99.3     493     0.7         40
   2000      46719     46167    98.8     552     1.2         40
   3000      56462     54553    96.6    1909     3.4         61
   4000      59228     53147    89.7    6081    10.3         85    <- the collapse
   5000      53681     48864    91.0    4817     9.0         80
   6000      23968     22696    94.7    1272     5.3         43
   7000..17000  the stage is EMPTY -- the boss is unported and the port sits on
                $294F32's 10,800-frame timeout with only buckets 0,5,14,15,16,19
```

drawn% by bucket, same bins — **this is the owner's report, one column at a
time**:

```
  steps      b0     b2     b3     b5    b19    b20
      0    100%   100%   100%    83%    91%    98%
   1000    100%   100%   100%    81%    92%    98%
   2000    100%   100%   100%    79%    88%    99%
   3000    100%    85%    86%    81%    88%   100%
   4000     87%    26%    90%    80%    90%    98%
   5000     96%     0%    60%    80%    89%   100%
   6000     87%     0%   100%    81%    87%   100%
```

**Bucket 2 — the big background structures — goes to ZERO and stays there.**

---

## 5. THE BLACK TERRAIN, AND THE BOSS'S BACKDROP — ONE CAUSE, AND IT IS NOT TILES

### 5.1 The background TILE supply is complete, verified not cited `[M]`

Ledger row L7 (415 harvested tiles against 1,820 referenced) and W15's claim to
have closed it: **verified.** `[M]` With all eight BG shards installed, every BG
map entry the port writes, on every frame:

```
  steps    entries       have    have%   IN NO SHARD  distinct-orphan
      0     512000     512000  100.00             0                0
    ...     (all fourteen bins identical)
   6500     512000     512000  100.00             0                0
ORPHAN TILES (in NO shard) over the run: 0
```

**AND A TRAP I FELL INTO FIRST, RECORDED SO NOBODY REPEATS IT.** My first run of
this probe reported have% falling `100.00 → 43.99 %`. That was **my harness**:
`loadBundle` awaits only the BOOT shards and I had fetched every SPRITE shard but
no deferred BG shard. A probe that skips them measures the SCHEDULE, not the art,
and it produces a confident wrong answer that looks exactly like the owner's
report. `[M]` The live page reports `shards 8/8` on every sample of §6, so the
schedule is not failing either.

### 5.2 It is background-ELEMENT SPRITE art, in buckets 2 and 3 `[M]`

Bucket 2 has **five** distinct missing streams and they arrive one at a time:

```
[M] $231C44  bucket 2  first at step 3626
[M] $231520  bucket 2  first at step 3754
[M] $232578  bucket 2  first at step 4298
[M] $232EAC  bucket 2  first at step 4746
[M] $233630  bucket 2  first at step 5274
```

Bucket 3 has **42**, from step 3561 — the `$151xxx`, `$172xxx` and `$17Dxxx`
families, arriving on a cadence of one every 4–8 steps (`$1723D4..$17277C` is a
19-frame animation run, every frame of it absent).

**That is the whole of "more and more".** It is not degradation; it is the stage
scrolling into structures whose art was never harvested. Bucket 2's records are
the 18x208-class monsters W55 §2.2 `[cited]` describes, so five missing streams
take the whole left half of the playfield to black.

**The boss's backdrop is the same subsystem.** The owner's *"the blades that draw
are only a background element, and the boss part of that same element is also
missing"* is bucket 2/3 with some streams present and some absent — exactly what
`$231520`/`$231C44` arriving at steps 3626/3754 while their neighbours draw
produces. `[M]` I did not isolate which element index owns the blades; the boss
OBJECT is out of scope by instruction.

---

## 6. THE LIVE PAGE, DRIVEN DEEP — WHAT I SAW `[M]`

`https://gbtman.pages.dev/games/ddpdoj/` in Chrome, build `20260805170024`
confirmed from inside the page. Fire tapped, ship swept left and right, **110
seconds — 6,600 logic frames past the seed, i.e. two and a half times the window
every "100 % drawn" claim was measured in.**

```
[M] BOOTED     lf 2659  clk 169  shards 8/8  spr 14/14  dl 54 drawn 54  (no NO ART)
[M] 20s        lf 4005  clk 236  dl 89 drawn 88   NO ART 1:  $0022A8
[M] 40s        lf 5189  clk 298  dl 37 drawn 36   NO ART 1:  $002314
[M] 55s        lf 6093  clk 355  dl 71 drawn 64   NO ART 7:  $231520 $231C44 $17D480
[M] 65s        lf 6669  clk 391  dl 130 drawn 118 NO ART 12: $17D480x2 $17D82C $1517C4
[M] 80s        lf 7557  clk 446  dl 57 drawn 50   NO ART 7:  $17D480 $17D8E0 $151DA8
[M] 110s       lf 9347  clk 836  dl 5 drawn 4     NO ART 1:  $001FFC
[M] PAGE ERRORS: none.  shards 8/8 and spr 14/14 on EVERY sample.  57.8-60.1 Hz
```

**Same addresses as the headless probe, on the machine the owner plays.**
`$231520` and `$231C44` are the two my probe first saw at steps 3754 and 3626;
the page names them at lf 6093, which is step 4093. Nothing is stuck in
delivery — the pictures are not in the bundle.

**WHAT IS ON THE SCREEN AT 65 s** (`.scratch`-equivalent
`d68-65s-t3900.png` in the session scratchpad): the right half of the playfield
is the golden rock terrain, drawn correctly. **The left half is a large black
polygon** with two big grey emplacements hanging over it and **twenty-odd blue
enemy bullets fanning out of the black** — bullets from things that are not
drawn. At 80 s the same shape appears as a black wedge over the blue stonework.
That is the owner's *"terrain starts being black after the golden terrain"* and
*"shots come out of nowhere"* in one frame.

---

## 7. E6's DEFECT SHAPE, SWEPT — one systematic family, and it is DECLARED

E6's defect was three `jsr $23FF42` sites transcribed as a bare counter, so a
record was never written. `[M]` I swept for more: every one of the 664 enqueue
call sites, against every citation of it in `games/ddpdoj/src/`.

```
[M] 119 citations of an enqueue call site in src/
[M]  43 have an actual enqueue call within +-4 lines
[M]  76 do not -- and 75 of those resolve on reading: they are either prose, or a
       branch-target citation, or a LOCAL WRAPPER that does emit
       (`bomb.js` draw23FF06/draw23FFB4 -> emitBucket13; the handlers' own
        enqueueRequest/enqueueThroughStub)
```

**THE ONE THAT DOES NOT RESOLVE IS `src/hud.js:595`:**

```js
function draw(ctx, addr) {
  note(ctx, addr, DRAWS[addr] ?? `a DRAW at $${addr.toString(16).toUpperCase()}`);
}
```

Every HUD draw is a counted note. `[M]` That covers **all 33 bucket-25 call
sites** (`$28490E`, `$284AB0`, `$284BFA`, `$284D96`, `$284DD6`, `$284E2E`,
`$284E6E`, `$284F94`, `$284FC4`, `$285058`, `$285098`, `$285132`, `$285172`,
`$28525C`, `$28529C`, `$285334`, `$285374`, `$28566C`, `$2856CC`, `$28583C`,
`$285874`, `$285A02`, `$285D12`, `$285D3E`, `$285D6A`, `$285DA2`, `$285DCE`,
`$285E8C`, `$285EB8`, `$285EE4`, `$285F1C`, `$285F48`, `$285FAE`), and `[M]`
bucket 25 carries **zero records on every frame of every run I made.**

**IT IS NOT W65's DEFECT AND MUST NOT BE FILED AS ONE.** W65's was silent;
this one names every site in its own `DRAWS` table and counts every call
(`[M] 6,951 x $285C5E`, `6,951 x $286040`, `2,653 x $2859DC`,
`1,604 x $2855B6`). It is a DECLARED deferral. The observable is identical from
outside — a bucket with 33 ROM producers and no records — which is exactly why
the drawn/missing metric cannot see either.

**What the player sees as a HUD today is `st.tx`, the 161-frame recording's TEXT
layer** (`src/web/app.js:768` says so), not the port's.

**No other case found.** That is a sweep result, not a proof: the sweep can only
see sites the port CITES, and a site nobody transcribed leaves no trace in
`src/` at all. Those are §2's five handlers, and they are found by measuring
objects, not by grepping.

---

## 8. **IS THE 100 % FIGURE MISLEADING, AND HOW SHOULD IT BE STATED**

### 8.1 What it measured, exactly

`drawn% = (display-list records whose `offs` is an exported stream in a
ready shard) / (display-list records emitted)`, over N frames of one input.

**It is a statement about the ART, conditioned on the port having emitted the
record.** It cannot see:

1. an object the port simulates and never emits a record for — §2, `[M]` 16,808
   collidable slot-frames in 7,000 frames;
2. an emit call site transcribed without emitting — §7, `[M]` 33 sites;
3. anything past the last frame of the run — §0.2, `[M]` 100.00 % → 95.61 %;
4. a record with a correct descriptor that is the WRONG record — nothing in this
   repo compares the port's list against the board.

**E6's own defect is the proof that (1) and (2) hide inside it**: the beam's 41
segments emitted nothing AND had no art, so a record that was never written and
a record with no picture were indistinguishable. §7 shows the same pair standing
today in bucket 25.

### 8.2 What "drawn% 100.0 %, ZERO missing streams" licenses, and what it does not

**IT LICENSES:** *"On input X for N frames, every display-list record this port
emitted had an exported stream behind it in a shard that had landed."*

**IT DOES NOT LICENSE:** "the screen is complete", "nothing is invisible", "the
art is finished", or the same sentence with N left off. `[M]` The identical
sentence is true at N = 2,600 and false at N = 4,000 on the same input.

### 8.3 The metric that would have caught this

**Report EMISSION COVERAGE beside drawn%, and always with its window:**

> Of the C collidable objects alive this frame, E emitted a display-list record
> and D of those drew. Over N frames from seed S on input I: C, E, D, and the
> per-TYPE table of the ones that never emitted, each named by its handler's ROM
> address.

`[M]` For the live build, playing input, 7,000 frames from the shipped seed:
**C = 100,783 slot-frames, E = 49,978 (49.6 %), D = 49,134 (48.8 %), and five
enemy types account for every non-emitter.** That sentence is harder to write
and impossible to misread, and it is `docs/knowledge/10`'s own rule applied to
the thing the port DRAWS instead of the thing it RUNS.

Two cheap gates fall out of it and neither exists today:

* **an EMISSION gate** — assert per type, from the ROM's own type table, that a
  type with an enqueue site in its handler's span produces a record when one of
  its objects is collidable. `[M]` It would go red on five types right now.
* **drawn% at TWO window lengths.** `[M]` A stage that asserts drawn% at 2,600
  AND at 6,000 frames would have failed the day W58 shipped.

---

## 9. THE CAUSES, RANKED, AND CLASSIFIED

The coordinator's five signals, each classified as (a) unported producer,
(b) missing art, (c) a deferred shard that never loads, (d) an emit site
transcribed without emitting, (e) a regression:

| # | the owner's signal | `[M]` cause | class | share of the owner's screen |
|---|---|---|---|---|
| **1** | "my shots hit invisible things" / "invisible enemies" | the fire/state tails of `$2747C6` `$269CEA` `$26A2E2` `$268232` `$27687E` are counted notes, and the enqueue sites are inside them | **(a)** | **141 of 295 spawned objects; 16,808 + 12,760 collidable slot-frames** |
| **2** | "terrain starts being black after the golden terrain" + "the boss part of the background element is missing" | bucket 2's five and bucket 3's 42 background-element streams, arriving from step 3561 | **(b)** | bucket 2 **100 % → 0 %**; the biggest area of screen |
| **3** | "more and more" | signals 1 and 2 are both time-ordered: the stage scrolls into unharvested structures, and the invisible types spawn later | (a)+(b) | the whole progression |
| **4** | "sometimes with hit sparks, sometimes not" | **NOT a defect in the spark.** `[M]` pool E runs 1.05–6.29 live records/frame, bucket 20 is **99.0 % drawn** over 25,155 records. A spark on a §2 enemy lands in empty space, which is what "sometimes" looks like | — | small |
| **5** | "but no splosions" | `[M]` pool B runs 0.47–3.26 live/frame, so E5b did NOT regress. But `[M]` **`$274AF0`, type `$82`'s death arm, is an unported note reached 213 times in 7,000 frames — a `$82` never dies, so it never explodes.** The types the owner is shooting are the invisible ones | **(a)** | every kill of the five types |
| **6** | (not reported — found here) | bucket 25, the whole HUD, 33 emit sites transcribed as notes | **(d)**, declared | the HUD on screen is the recording's |

**Nothing is class (c) and nothing is class (e).** `[M]` `shards 8/8`,
`spr 14/14`, `PAGE ERRORS none` on every live sample; the BG tile sheet is
100.00 % complete; E4's, E5a's and E5b's subsystems all still run.

---

## 10. THE WAVE LIST — ranked by measured payoff

**W69 — THE THIRTY INSTRUCTIONS. `$269D84..$269E1C`, TYPES `$05` `$07` `$27`.**
Wire the fire/state machine so it reaches `$269E20` → `$269E3E` → `$269B3E`.
**The port ALREADY HAS both blocks** (`drawFamily269E20`, `drawFamily269B3E`,
running today for types `$08`/`$09`/`$0B`). `[M]` **Payoff: 72 spawned objects
and 7,078 invisible collidable slot-frames become visible, and `$1718F4` IS
ALREADY IN THE SHIPPED SHEET — zero new bytes of art, zero new ROM window.**
`handlers.js:1726` names the one hazard: the machine slews a heading into
`($1B,A6)`, which the `fly-around` gate compares, so it needs its own
before/after. **This is the highest payoff per line in the project right now.**
Gate: types `$05`/`$07`/`$27` emit ≥1 bucket-7 record per collidable frame.

**W70 — TYPE `$82`, `$2747FA..$274B64`.** `[M]` The single largest: 21 objects,
9,730 invisible slot-frames, three enqueue sites `$274A28`/`$274A4A` (bucket 7)
and `$274A7E` (bucket 3), **and the death arm `$274AF0` in the same block** — so
it fixes signal 5 for this type at the same time. Needs art: `[M]` `$1735FC` is
not in the sheet. Harvest it from the cartridge by address, never off the run
(W66 §2's rule).

**W71 — THE BACKGROUND ELEMENTS' ART.** `[M]` bucket 2's five
(`$231520 $231C44 $232578 $232EAC $233630`) and bucket 3's 42 (`$151894..$151DA8`,
`$1723D4..$17277C`, `$17D480..$17D8E0`). Bucket 2's are the 18x208-class records,
so five streams buy the largest area of screen in the list. An EXPORT wave with
no `src/` change, behind the shard machinery that already exists. **This is the
black terrain and the boss's backdrop.**

**W72 — TYPES `$10` AND `$8B`.** `[M]` 47 objects, 10,315 collidable slot-frames
whose sprite pointer is never written. `$2682F8..$268490` and `$27687E`'s tail.
Both emit through indirect `jsr (A0)`, so the stub comes out of the record.

**W73 — BUCKET 25, THE HUD.** 33 sites, `src/hud.js`'s `draw()`. It is the last
thing on screen that is still the recording's, and naming it closes W40 §7.3 and
W11 §6's unresolved bucket.

**W74 — THE MEASUREMENT.** The emission gate and the two-window drawn% of §8.3.
`[M]` Both go red on today's tree.

---

## 11. WHAT I COULD NOT DETERMINE

1. **Nothing here is compared against MAME.** Every number is the port replayed
   against its own published bundle, or the ROM read statically. A record with a
   correct descriptor can still be the wrong record.
2. **Which background element owns the blades.** I measured that bucket 2 and 3
   are the subsystem and named the streams; I did not walk `$2623F4..$2631CA`'s
   35 sites to say which element index draws the blade and which the boss body.
3. **Why 68 of type `$07`'s 3,886 slot-frames DID emit.** `[M]` A descriptor is
   matched by value, so another producer emitting the same `offs` in the same
   frame counts as a match. The 98.3 % is therefore a floor on the invisibility,
   not a ceiling.
4. **The spark's "sometimes".** `[M]` Pool E runs and bucket 20 draws at 99.0 %;
   I did not separate "a hit that spawns no spark" from "a spark drawn over an
   invisible enemy". The cheap test is to count `$289F54` allocations per hit
   per enemy type in the same run.
5. **The three types with 0 collidable slot-frames in my window** — `$8A` (9
   spawns), `$20` (5), `$24`, `$31`, `$21` (1 each). Presence, not absence: my
   window did not make them collidable.
6. **One input.** 7,000 and 17,533 frames of one playing route. Another route
   reaches types I never spawned. Every count here is a floor.
7. **The midboss.** §2.1 withdraws it. Whether its destructible parts each draw
   is not settled by this measurement, only that its extra slots are not sprite
   records.

---

## LOG (appended as findings arrived)

- opened.
- §1 `[M]`: **the brief's premise is partly refused.** The invisible collidables
  are in buckets 7 and 3, which the port fills 100 % and 93.8 % of the time.
  Bucket coverage is the wrong instrument; per-object emission is the right one.
- §3 `[M]`: **25 of 30 buckets have ROM producers; the port fills 14** (15 with a
  bomb press). The figure has moved 2 → 8 → 11 → 14.
- §2 `[M]`: **THE ANSWER.** Types `$82` `$05` `$07` `$27` are collidable,
  damageable and never emit a record — their only enqueue sites lie inside the
  fire/state tail the port replaces with a counted note. `$10`, `$8B` and the
  boss are the same one step earlier. **141 of 295 spawned objects.**
- §2.4 `[M]`: **`$1718F4` IS ALREADY IN THE SHIPPED SHEET**, so `$05`/`$07`/`$27`
  cost thirty instructions and no art.
- §0.2 `[M]`: **E3/E6's own input reproduces 100.00 % / ZERO missing at 2,600
  frames and gives 95.61 % / 63 missing at 7,000.** The figure was true; the
  window was short.
- §5.1 `[M]`: **the BG tile sheet is 100.00 % complete, 0 orphans** — L7 verified,
  not cited. **And my own first probe said 43.99 % because it had not fetched the
  deferred BG shards** — recorded so nobody repeats it.
- §5.2 `[M]`: **the black terrain is bucket 2/3 background-ELEMENT SPRITE art**,
  five streams and 42, arriving from step 3561. Bucket 2 goes 100 % → 0 %.
- §7 `[M]`: **bucket 25 is the HUD** — 33 emit sites transcribed as `note()` in
  `src/hud.js`. E6's shape, but DECLARED, not silent. Closes W40 §7.3.
- §6 `[M]`: **the live build, driven 110 s past the boot window, names the same
  addresses** — `$231520 $231C44 $17D480` — with `shards 8/8`, `spr 14/14` and no
  page errors. A screenshot at 65 s shows the black half-playfield with enemy
  bullets fanning out of it.
- §9 `[M]`: **signals 1, 3 and 5 are ONE cause.** The sparks did not regress and
  the explosions did not regress; the enemies the owner shoots are invisible,
  and type `$82` cannot die because `$274AF0` is unported.
- §8 `[M]`: the corrected statement of coverage, and the two gates that would
  have caught this.

*No file under `games/` was modified. No web server was started. Every probe is
in the session scratchpad.*

status: **DONE**
