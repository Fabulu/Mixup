# 54 — IMPL E5b: THE ENEMY DEATH EXPLOSION (pool B, `$289004` + `$288E4E`)

status: **DONE**

started: 2026-08-05
role: IMPLEMENTER. SOLE writer to `games/ddpdoj/`. `games/gradius/` NOT TOUCHED.
target: `ddpdojblk` VERSION-B. Every address is build B (`$23xxxx`–`$2Axxxx`)
unless the line says otherwise.

brief: the owner is playing the live build — "Shooting enemies with bullets
works, but you can't see the bullets and no explosions." E4 made the bullets
visible; E5a made the shot's impact spark visible. **Mine is the DEATH
EXPLOSION** — the thing that happens when an enemy actually dies.

inputs read in full: 53-impl-E5a-spark, 50-recon-effects, 47-impl-E2-art,
52-impl-E4-bullets, HANDOVER, `docs/knowledge/09` and `10`.

`[M]` = measured by me, this session, on this tree.

---

## 0. THE BRIEF'S PREMISE, CHECKED

Recon 50's SHAPE is right and I reproduced its headline numbers to the digit —
worth saying, because W53 found five of its statements about pool E wrong.
Everything below about pools B and D is reproduced independently from
`maincpu.bin` this session.

### 0.1 RECON 50, REPRODUCED EXACTLY  [M]

```
[M] $221520 + 34*8 == $221630                                       EXACT
[M] $221630 + 34*8 == $221740 == kind 0's own descriptor list       EXACT
[M] 68 script entries -> 23 DISTINCT scripts, data $221740..$222617
[M] 269 distinct effect streams, $2016B4..$227FA4
[M] IN THE SHIPPED SHEET: 0 of 269                    (783 shipped keys)
[M] priced with the PORT's own streamExtent + coalesce + gzip -9:
        all 269               218.4 KiB gz, 0 unresolvable
        recon 50's "8 kinds"  204 streams, 195.8 KiB gz
[M] $81B732 + 80*$38 == $81C8B2, THE BIT BUCKET                     EXACT
[M] $81C8B2 +    $38 == $81C8EA, the live count                     EXACT
[M] $288E0C clears ($8DC+1)*2 = 4,538 B = 80 x $38 + the bit bucket
    + the count word                                                EXACT
[M] $289084 clears ($280+1)*2 = 1,282 B = 20 x $40 + $81CDEC        EXACT
[M] $288FF0 = $23D762 $23D79E $23D7DA $23D816 $23D852; entry [5] is
    $48E7C07E = $289004's own movem.l, CODE            -> buckets 0,1,2,3,7
[M] $2440E0's 39-entry table $244ACE: $85 x18, $D x17, $84 x3, $C x1
[M] $26B214: 14 records, $FFFF terminator at $26B284
[M] 327 absolute-long `jsr/jmp $289004` sites in $230000..$2AFFFF
```

### 0.2 AND SEVEN THINGS IN IT ARE WRONG  [M]

| recon 50 / the brief says | [M] this session |
|---|---|
| "EIGHT distinct kinds on the port's damage path: `$1 $2 $3 $7 $C $D $84 $85`" | That is what its RUN reached. **STATICALLY, from the listing, the port's OWN ported arms pass ELEVEN**: `$1 $2 $3 $4 $5 $7 $9 $C $D $84 $85`. `$5` is `$275B20`'s (`handlers.js`, ported since W30), `$9` is two entries of the midboss's own `$26B214` list, `$4` is the row below. **[M] AND ALL ELEVEN ARE REACHED IN A 2,192-FRAME TAPPED RUN** (§2) — so this is not a theoretical margin, it is three kinds recon 50's harvest would have shipped no art for. `docs/knowledge/09` in one line. |
| the port's own note: type `$10`'s death arm is `D0=$7` (`handlers.js:677`, since W25b) | **[M] `$2681D6 moveq #$4,D0`. It is kind `$4`, not `$7`** — read out of the image, and pinned in `tests/w54effects.test.js` by reading it out of the image again and requiring `src/handlers.js` to pass the same byte. Kind `$4` is in nobody's list. |
| "every death arm I read writes `move.w #$0,($12,A0)`" (§4.2, the leak argument) | **[M] TWELVE of the twenty-seven ported sites write `#$1`** — `$273DDA $273E0E $273E42 $273E7A $273EB2 $273EEC` (type `$80`'s six), `$2762E4 $276322 $276366 $2763AC` (type `$88`'s four), `$2774EE` (type `$89`) and `$26B89C` (the midboss arm) — and `($12,A0)` is a COUNT MINUS ONE (`$289098 andi.l #$FF / addi.l #-$10000 / dbra`), so each of those asks pool D for **TWO** records, not one. And **type `$11`'s death arm puts `$FFFF` BACK** at `$26888A` when `$815EA2` is already set, i.e. it DISARMS the sub-spawn on the second effect of a frame. [M] over 2,192 tapped frames that is **126 sub-spawns for 146 pool-D records**, against a 20-slot pool. The leak is real and its rate is not the one recon 50 computed. |
| `$28925E..$28960F` is "434 bytes; I did not find the table that reaches it" (§10.3) | **It is not reached by a table. `$28915A bpl $28925E` and `$28915E bra $289292` branch to it directly**, out of `$289152 tst.w ($1e,A6)`. Recon 50 looked for a dispatch; the answer is a conditional branch two instructions earlier. |
| pool D core is "474 B, 4 routines" | **[M] far larger** — §4. ~1,800 B of code and tables, an unpinned `$200920` window and seven unported callees. |
| `$81C8EA` is "re-counted each frame, `addq.w #1` per live slot" | True, **and the `addq` is BELOW the spawn-delay skip** (`$288E64`/`$288E74`), so a record counting down its `($18,A6)` is live, holds a slot, and is NOT in the count. A census that trusts the count word alone under-reports the pool. §2 scans all 80 slots as well. |
| "+$1A angle, +$1B speed" (§1.2's record map) | **BACKWARDS.** `$288F1A move.b ($1a,A6),D0` and `$288F24 move.b ($1b,A6),D1`, and `$241D34` takes **D0 = the SPEED INDEX, D1 = the ANGLE** (`src/vectors.js shotVector`, ported since wave 8). Type `$88`'s own literal `#$05C0` is speed 5 / angle $C0, and every one of the eleven literals in the death arms is ≤ `$0C` in its high byte — i.e. a speed index, not an angle. |

### 0.3 `$289004`'s OWN DEAD BRANCH  [M]

```
289008: move.w D0,D1 / andi.w #$7f,D1
28900e: cmpi.w #$0,D1 / blt $289078      <- D1 is masked to 0..$7F, so `blt`
                                            CANNOT be taken.  Transcribed and
                                            named; never exercised.
289016: cmpi.w #$21,D1 / bgt $289078     <- kinds $22..$7F (and $A2..$FF) go to
                                            THE BIT BUCKET.  34 entries.
28901e: move.w #$4f,D1                   <- and D1 is REUSED as the 80-slot loop
                                            counter, so the CHECKED value is
                                            never read again.  The KIND lives in
                                            D0, whose bit 7 picks table $221630.
```

### 0.4 AND ONE THING A "TIDY" PORT GETS WRONG, WHICH RECON 50 LEFT AMBIGUOUS

`$288E7A bset #6,(A6)` — recon 50 §1.2 calls it "bit 6 = the script has been
started" without saying of what. **`08d6 0006` with a MEMORY destination is
BYTE-sized on the 68000**, so the bit is bit 6 of the HIGH byte: `$8000` becomes
`$C000`, not `$8040`. Reading it as bit 6 of the WORD puts the started flag
inside THE KIND, where `$288E84 andi.w #$FF,D1` reads it straight back and the
script reloads its cursors every frame. Mutant M14.

---

## 1. WHAT WAS PORTED

| ROM | bytes | what | where |
|---|---|---|---|
| `$288E0C..$288E1F` | 20 | the whole-pool clear: 80 slots + the bit bucket + `$81C8EA` | `effects.js clearEffectPool` |
| `$288E20..$288E4D` | 46 | THE DESCRIPTOR WALKER and both 8-byte escapes | `effects.js walkDescriptor288E20` |
| `$288E4E..$288FEF` | 418 | THE DRIVER: the 80-slot walk, the spawn delay, the first-frame script load, the scroll, `$24179E`, speed→velocity, friction, the off-screen cull, the animation, THE LASER INTERLOCK, the emit | `effects.js runEffectDriver` |
| `$288ED0..$288EFA` | 42 | the pool-D sub-spawn — **everything except the `jsr`** (§4) | `effects.js subSpawn288ED0` |
| `$288FF0` | 20 | the 5-entry emitter table, range-checked | `effects.js EMIT_STUB` |
| `$289004..$289083` | 128 | THE ALLOCATOR, its eleven field inits, its range check and **its BIT BUCKET, counted** | `effects.js spawnEffect` |
| `$289084..$289097` | 20 | pool D's clear | `effects.js clearSubEffectPool` |
| 27 death-arm sites | ~600 | the six-to-nine field writes each one makes into the record the allocator returned | `handlers.js`, `midboss.js` |
| `$267FA0`, `$278320` | 60 | the two enemy-bucket → effect-bucket remap tables, as ROM windows | `export-tables.py` |
| `$221520..$222617` | 4,344 | the two script tables and ALL 68 entries' data, as ONE ROM window | `export-tables.py` |

**Pools A, C and E are untouched. Pool D is REFUSED, not half-ported (§4).
`games/gradius/` NOT TOUCHED.**

### 1.1 THE CALL SITES, one by one

`50-recon` §2.1's headline is right and it is the shape of this wave: **there is
no shared spawner.** Every arm inlines `moveq #kind,D0 / jsr $289004` and then
writes its own fields, so there are twenty-five separate transcriptions here
covering twenty-seven ROM sites, and not one. Three GROUPS share instructions
and are written once:

* **`effectArmNine`** — `$268958` (type `$11` hit, kind `$3`, the `$267FAC` HIT
  row), `$2682C0` (type `$10`'s first zero, `$3`, the same row) and `$2681DC`
  (type `$10`'s death, **`$4`**, the `$267FA0` DEATH row). Nine instructions,
  identical at all three, including `($12,A0) = 0` — the pool-D arm.
* **`effectArmShared278320`** — `$276910`, `$2767EE`, `$2774D0`, `$2762C6`,
  `$276304`, `$276348`, `$27638E`. Position, then the bucket remapped through
  `$278320` with a WORD index DOUBLED, not the byte offset the `$267Fxx` arms
  use. Each caller adds its own tail.
* **`effectArmFamily`** — `$269D1E`, `$26A618`, `$26A882`, `$26AD4A`. No remap
  at all: bucket `$10` flat, plus the enemy's SPEED + 8 and its HEADING × 4,
  which is what makes the burst fly on the dying enemy's own vector. `($12,A0)`
  is NOT written, so these never sub-spawn.

and the rest are written out: `$275B22`/`$275B4E`/`$275B76` (three, kinds `$5`
`$C` `$84`), `$273DC2..$273EC8` (six, type `$80`'s), `$26B19A` (the midboss's
per-arm, position from THE ARM `A4`), `$26B1E4` (fourteen, off the `$26B214`
list, positions from THE BODY `A6`) and `$26B884` (the midboss arm's own).

**Every `null` in those tables is a field the ROM does NOT write at that site,
and it is not the same as writing 0**: `$289004` zeroes a FRESH slot, but a
bit-bucket allocation lands in `$81C8B2`, which still holds the last discarded
record's bytes.

---

## 2. THE POOL CENSUS — the drain proof, over long runs  [M]

The shipped bundle seed, `$810424 = $FF` each step, three inputs, to each run's
honest end. **Per frame the probe scans ALL 80 SLOTS and reads `$81C8EA`, and
reconciles them through an identity the ROM's own semantics force:**

```
    liveAfterScan  ==  $81C8EA  -  freedThisFrame  +  delayedThisFrame
```

`$81C8EA` is NOT "how many slots are live now": it counts records that were live
AND past their spawn delay when the driver visited them (`$288E74` is below
`$288E64`'s skip), and the three frees never decrement it — the count is rebuilt
from zero next frame. Every term on the right of that identity comes from the
driver, every term on the left from an independent scan. **That is a census, not
a restatement**, and it is asserted on every frame rather than summarised.

```
                                   TAP (every 4)    HOLD          NO-FIRE (CONTROL)
[M] frames run                        2,192          1,766          4,200
[M] stopped by                       $26C1C4        $26C1C4        ran to the end
[M] pool B live slots, MAX          23 of 80       22 of 80        0 of 80
[M] $81C8EA max                        17             10             0
[M] the census identity          0 DISAGREEMENTS 0 DISAGREEMENTS 0 DISAGREEMENTS
[M] frames back at ZERO               402            172            -
[M]   ...longest consecutive          265            117            -
[M] BIT BUCKET $81C8B2 non-zero      0 frames       0 frames       0 frames
[M] $289004 allocations               171            147             0
[M]   ...distinct kind@site pairs      22             19             0
[M]   ...distinct CALL SITES           18             15             0  (of 27)
[M] pool-D sub-spawns REFUSED         126            117             0
[M] POOL D live slots, MAX          0 of 20        0 of 20        0 of 20
[M] bucket 0/1/2/3/7 records    31,708 / 1,152 / 4,926 / 15,195 / 3,457   (tap)
[M] distinct effect streams           204            176             0
[M]   ...with art                     204            176             -
[M]   ...NAMED-missing                  0              0             -
[M] distinct KINDS reached             11             11             0
```

**THE DRAIN PROOF IS THE THIRD ROW FROM THE BOTTOM AND THE `zero` ROWS.** A pool
that leaks cannot go back to zero; this one is empty on 402 of 2,192 tapped
frames and for 265 consecutive frames at a stretch, while being filled 171
times. 23 of 80 is the high-water mark of a pool under continuous pressure.

**And the structural half, which is what makes 23 of 80 not luck:** every record
is freed by one of three paths and there is no fourth — `$288F9C` reached from
the off-screen cull (`$288F74`/`$288F82`), `$288F9C` reached from the duration
list's `$FFFF` terminator (`$288F98`), and `$288E0C`'s whole-pool clear. [M] the
longest script in the two tables is 36 cells and every one of the 23 ends in
`$FFFF`, so a record that survives the cull still dies on its own schedule.

**THE ELEVEN KINDS ARE THE HEADLINE OF §0.2 MEASURED FROM THE OTHER SIDE.** [M]
`$1 $2 $3 $4 $5 $7 $9 $C $D $84 $85` all appear as live records in the tapped
run. Recon 50's eight would have shipped no art for `$4`, `$5` and `$9`, and
`$4` is type `$10`'s death — one of the two most common enemies in the stage.

**THE CONTROL DOES WHAT A CONTROL MUST.** 4,200 frames with nothing pressed:
0 allocations, 0 live slots, 0 records, 0 streams — and the run does not stop,
so it is 4,200 frames of evidence rather than a short one that happened not to
break. Nothing dies without the player shooting it.

---

## 3. THE ART — 269 streams, 218.4 KiB, and BOOT WENT UP BY 4.1 KiB

```
[M] BOOT BEFORE   472.0 KiB   (W53's own final figure, export-web.mjs's number)
[M] BOOT AFTER    476.1 KiB   -- +4.1 KiB, and here is every byte of it
[M] deferred      746.2 -> 964.6 KiB
    shard 9 explode  269 streams  mask 50,473 + col 173,175 = 218.4 KiB
```

**Boot rose, on the fifth deploy after four falls, and the brief asks by how much
and why. It is +4,194 B in three named parts:**

* **+1,781 B — the `$221520..$222617` ROM WINDOW**, 4,344 bytes of script tables
  and script data (`player.tables.json.gz` 133,612 → 135,393). **It cannot be
  deferred, and that is a mechanism fact rather than a preference**: a missing
  sprite stream is a NAMED SKIP the page draws around, but a missing ROM window
  is a THROW out of `src/rom.js` — the whole reason `RomWindows` exists. Shard 9
  can arrive late; the script data cannot.
* **+1,953 B — SEVEN MORE SPEED LEVELS** (65 → 72 exported). `$288F28 jsr
  $241D34` is a NEW READER of the speed table with a NEW INDEX DOMAIN: the
  damage-first family's `$269D2E addq.b #8,D0` hands it the dying enemy's own
  speed plus eight. [M] the port threw `speed index 37 was not exported` on the
  first family kill. `effect_speed_indices` DERIVES the domain from the listing
  — every `move.w #imm,($1a,A0)` after a `jsr $289004`, plus the whole of
  `enemy_speed_indices` shifted up by 8 — rather than widening it by hand, and
  it REFUSES TO EXPORT if the `move.b D0,($1a,A0)` form has stopped appearing.
* **+460 B — `manifest.json`** for shard 9's entry and the fetch order. That file
  is the one body served UNCOMPRESSED (W47 §2.4), so every byte of it is a boot
  byte.

**WHAT WAS TRIED AND DID NOT HELP, so nobody re-derives it:** W53 already took
the two savings that were available — the stream table is a typed array (W47)
and `manifest.json` is written compact (W53) — and W53 measured base64 for the
ROM windows as **14.4 KB BIGGER gzipped**. There is no third one here. The
honest statement is that this wave costs 4.1 KiB of boot for the death
explosion, and the thing that would retire most of it is a TABLES SHARD with a
`demand()` contract of its own, which is a wave.

### 3.1 ALL 269 SHIP, NOT THE 204 A RUN REACHES  [M]

W53 §1.3's decision, one level up. The harvest is the TABLE'S OWN EXTENT:

* [M] the port's ported arms can pass ELEVEN kinds and recon 50's run measured
  eight (§0.2). A harvest cut to a measured kind set goes short the first time a
  run reaches a twelfth — and this wave's own run already reached three of them.
* both ends are pinned by data that is not the harvest's own line:
  `$221520 + 34*8 == $221630`, `$221630 + 34*8 == $221740` (entry [0][0]'s own
  descriptor list), and walking all 68 entries in lockstep lands EXACTLY on
  `$222618`. `check_pool_b_extents` asserts all of it on every export, **and
  asserts the declared window LENGTH against the walk** — because a short window
  is not caught at the export, it is caught on a player's machine.
* [M] it costs **22.6 KiB gz** over the 204 (218.4 against 195.8), all of it
  DEFERRED, against 65 streams that would otherwise be a wrong picture the day a
  boss or `$2440E0` runs.

Shard 9 is fetched **fourth** (`SPR_ORDER = [0, 7, 6, 9, 8, 1, 2, 3, 4, 5]`),
ahead of the 0.8 KiB spark: [M] both first-need at frame 24 of `webgate`'s
tapped window, and `demand()` promotes whichever the simulation reaches first.

**Shard 0 is untouched**, so `capture.bin` is byte-identical and `bundlegate`'s
pixel identity cannot have moved.

---

## 4. THE REFUSAL — pool D is NOT ported, and NOT allocated from

The brief's own trap: *"`$288E4E` sub-allocates into pool `$81C8EC` (20 slots)
whose ONLY consumer is `$2890F2` — so porting `$289004 + $288E4E` alone REBUILDS
W33's LEAK ONE LEVEL DOWN."* It does. There are exactly two ways past it.

**(a) PORT POOL D TOO.** [M] measured from the listing this session, because
recon 50's "474 B, 4 routines" is not what is there:

```
$2890F2..$2892D8   the driver body                       ~486 B
$2892DA..$28930A   a VECTOR SOLVER off a pointer table at $200920, indexed by
                   ($1a,A6)*4, whose extent NOTHING IN THE LISTING PINS
$28930A..$2893CF   a four-arm quadrant jump table at stride $40
$2893D0..$2894D0   128 words of i*8
$289610..$289657   the animation stepper + its own 5-entry table $289644
$289658..$2897FB   THE FILL, with a 4-entry list table $2897D0
$2897FC..$289AE0   FIVE 144-byte templates
callees this port does not have: $241E34 $24397A $242FDE $242EC2 $242CAC
                                 $2431F4 $242B3C
```

~1,800 B of code and tables, an unpinned ROM window and its own unpriced art.
**That is a wave, not a paragraph.**

**(b) REFUSE TO ALLOCATE.** W52 §0.2's shape exactly — it was handed the impact
pool `$27F8F8` and refused it rather than allocate without its driver.
`subSpawn288ED0` does everything `$288ED0..$288EFA` does EXCEPT the `jsr`: the
`($1c,A6)` push/pop (a no-op without the call), the `($16,A6) → ($1d,A6)` copy,
and the one-shot `($12,A6) = $FFFF`. The call is COUNTED by `$289098`'s own
address, with how many records were refused and with what D0.

**(b) SHIPS, AND ITS EVIDENCE IS STRONGER THAN "IT LEAKS SLOWLY":** [M] pool D
holds **0 of 20 slots and `$81CDEC` reads 0** at the end of every run in §2,
including the 4,200-frame control. Nothing fills it, so it cannot leak.

**THE COST, NAMED RATHER THAN DISCOVERED LATER:**

1. **the secondary debris every explosion would throw is MISSING.** [M] 126
   refusals in the 2,192-frame tapped run — 106 asking for ONE pool-D record and
   20 asking for TWO — so **146 pool-D records the board would have made, and
   this port makes none.** Against a 20-slot pool with `$2890F2` unported, those
   146 would have been 20 allocations and then 126 silent discards.
2. **`$289658` makes SIX RNG DRAWS** off the shared `$803916`/`$803917` counters
   (`$242FDE`, `$242EC2` ×2, `$242CAC`, `$2431F4` ×2, `$242B3C`), and the port
   does not make them. That is the same class of defect W53 §0 FIXED for
   `$289F62` — and it is why §5's "the RNG did not move" is a statement about
   the REFUSAL and not a proof of correctness.

`$289084`, pool D's clear, IS ported: a pool that survives a reset it should not
is `50-recon` §4.3 item 6, and it is 20 bytes.

---

## 5. THE SCORING, RE-MEASURED — the brief's "VERIFIED HAS A SHELF LIFE"

W51 measured the ledger and W53 re-measured it; this wave changes what runs on
every kill, so it was re-read rather than inherited. Same 1,500-frame tapped
window as W53 §4.4:

```
                            W53's tree          THIS tree
[M] kills reaching $28615E        130                 130
[M] $81B4C0 pending score   $00077515           $00077515
[M] $81B5DA chain                 304                 304
[M] $81B5C0 meter / cap        56 / 56             56 / 56
[M] $81B64A rank feed               0                   0
[M] $286674 executions            128                 128
[M] $803916 RNG state            $C2                 $C2
```

**Every column identical, INCLUDING the RNG state — and that is the interesting
one.** It is not vacuous: the intervention is demonstrably live (171 allocations
and 5,537 display-list records over overlapping windows). It is unmoved because
every death arm calls `scoreKill` BEFORE `jsr $289004`, and neither `$289004`
nor `$288E4E` draws. **But `$289098` WOULD have drawn six times per sub-spawn**
(§4), so `$803916 = $C2` is evidence that THE REFUSAL is measurable, not
evidence that the port now matches the board on this column.

---

## 6. EVERY CHECK SEEN TO FAIL

### 6.1 Fifty-three unit mutants, fifty-three named reds, no survivors

`node games/ddpdoj/.scratch/mutate54.mjs`: apply ONE edit, run ONE test file,
require a NAMED test red, restore, **verify the file's sha256 is byte-identical**
(the harness throws on a mismatch). Every restore matched.

```
[M] 53 of 53 mutants turned a NAMED test red; survivors 0; SKIPPED 0
```

The mutants, by what they break: the three geometry arithmetics (M1–M3); the
allocator's bit bucket, its range check, its `$7F` mask, its eleven field inits
and the position it must NOT write (M4–M10); the descriptor walker's word-sized
escape tag, its `add.l` and its 8-byte stride (M11–M13); the driver's byte-sized
`bset`, its script-table branch, the first cell's `+1`, the spawn-delay skip,
the count word's rebuild, both halves of the off-screen cull, the script
terminator's free, the animation's borrow, `$241D34`'s argument order, the
speed byte's one-shot clear, friction's two word subtractions and its borrow,
position += velocity's two word adds, the laser interlock three ways, the
emitter range check and the 80-slot walk (M14–M32); the refusal's four
instructions (M33–M36); the remap rows (M37–M38); seven call-site semantics
including **type `$10`'s kind `$4`** and **type `$11`'s `$FFFF` disarm**
(M39–M45); and the delivery — `TYPE5_PORTED`, the harvest extent, the boot
shard, the fetch order and both exporter assertions (M46–M53).

**FIVE OF MY OWN CHECKS COULD NOT FAIL WHEN FIRST WRITTEN, and so could the
HARNESS.** Recorded as category (a), defective checks, because that is what they
were:

* **THE FIRST PASS AIMED EVERY NEEDLE AT AN ASSERTION MESSAGE INSTEAD OF A TEST
  NAME**, and `node --test` prints only the test NAME on its `not ok` line. 21
  of 53 came back "SURVIVOR" for that reason alone. A mutation harness that
  cannot see a red is worth less than no harness, because it reports green.
* **the friction fixture had no BORROW** (`$0200 - $0020`), so one `sub.l` and
  two `sub.w`s agreed for every input. It is `$0010 - $0020` now.
* **there was no position-carry case at all**, so `add.l` and two `add.w`s
  agreed. There is one now, and it has its own test.
* **the escape-tag test used `$FFFF` and `$8000` only**, neither of which
  separates `cmpi.w #$FFFF` from a high-byte test. A `$FF00` NUDGE case now does.
* **three call-site semantics had no assertion at all** — type `$10`'s kind,
  type `$11`'s `$FFFF` disarm and the midboss's `A4`-vs-`A6` position. All three
  are the kind of thing a reviewer finds after shipping; the mutation cycle
  found them in twenty minutes.

**AND ONE MUTANT WAS DEFECTIVE, recorded rather than quietly repaired.** M29's
first form was `if (parityGate) { a6; continue; }` against `if (parityGate)
continue;` — behaviourally identical, because the record's stepping is already
ABOVE that line. It is aimed at hoisting the gate above the stepping now, which
is the mistake it was supposed to model.

### 6.2 The exporter's own checks, seen red against the CARTRIDGE

A unit test can only read the exporter's source. These run the real export
against the real ROM; each file was sha256'd byte-identical after.

| mutation | what it printed |
|---|---|
| the tables claimed as 33 entries each | `the effect script tables no longer abut: $221520 + 33*8 = $221628 (want $221630) and $221630 + 33*8 = $221738 (want $221740).` |
| the `$221520` window declared `$10F0` | `SHOT_WINDOWS declares [(2233632, 4336)] for $221520; walking all 68 script entries says it must be $10F8 bytes ($221520..$222617). A SHORT window is not caught at the export -- it is caught by src/rom.js on a player's machine.` |
| the stream count claimed as recon 50's 204 | `the 68 effect entries resolve to 23 distinct scripts over 269 distinct streams; W54 measured 23 and 269 (reproducing 50-recon-effects §5.1 exactly).` |
| the walk stops one entry early per table | `the effect scripts: walking 66 entries reaches $222618; this file says 68 entries ending at $222618. The $221520 ROM window in tools/export-tables.py is sized off the SAME number, so a short walk here ships a truncated script the port then reads past.` |

**AND THE SECOND ONE EXISTS BECAUSE THE FIRST ATTEMPT DID NOT CATCH IT.**
Shortening the declared window by 8 bytes originally exported cleanly — the walk
proved where the data ends and the `SHOT_WINDOWS` line beside it could still
claim any length. `check_pool_b_extents` now compares the declared length
against the walk, with both numbers out of variables.

### 6.3 The GATE stage, W54, with three absolute port-side numbers

`webgate`'s W54 stage asserts, over 1,200 logic frames from the shipped seed
with fire tapped every 4 frames: **shard 9 holds 269 streams**, the port's own
`$800000` list carries **5,537 records of them** over **204 distinct images**,
first at **frame 24**, all drawn, 0 pending, 0 with no art. `records`,
`distinct` and `first` come out of the port's own emitter and no bundle can
supply them — W47 §4.1's rule about a stage that agrees with itself.

**AND W52's AND W53's NUMBERS DID NOT MOVE**, which is the evidence that pool B
has no side effect on the weapons' trajectory: shots 22,107 / 20 / frame 1 and
bullets 4,387 / 32 / frame 98 and the spark 8,843 / 35 / frame 24, all `===`.

---

## 7. THE PAGE, IN A REAL BROWSER — WHAT I SAW  [M]

Chrome + Python `playwright`, the recipe W42 established. Nothing downloaded.
**Both servers were killed afterwards and [M] zero `python -m http.server` and
zero `serve404.py` processes remain, and zero listeners on 8000/8125/8753/8754/
8761/8762** — checked with `Get-CimInstance Win32_Process` and
`Get-NetTCPConnection`, not with `ps`, which does not see them on this machine.

### 7.1 **ENEMIES EXPLODE**

**[M] Flying the ship UP into the tanks and tapping fire: BIG YELLOW-ORANGE
FIREBALLS where the enemies were — a bright molten core with ragged flame edges
and a spray of small yellow sparks thrown out of it, easily four times the size
of the ship.** In one frame there are two of them side by side at the top of the
screen, one directly over a green enemy that is mid-death; a few frames later
the same place is clear road again, so they appear, bloom and are gone.

**[M] They are a different thing from everything else on the screen:** the
ship's own steady orange exhaust plume directly beneath it (which the control
has too), the small white-hot impact sparks W53 added where a shot connects, the
blue and pink enemy bullets, and the tanks' own bodies. The explosion is the
only large object in the frame.

**[M] THE CONTROL — the same seed with fire never pressed — has NO fireball on
any sample**, at boot, at +3 s or at +6 s: tanks with bodies rolling down the
road, enemy bullets, the ship's exhaust, and nothing else. That is the same
shape as §2's measurement: 171 allocations with fire and 0 without.

`spr 10/10` on the status line at every sample — all ten sprite shards land —
and **not one address the page names is an effect stream.** The remaining
`NO ART` list is W47/W52's own leftovers (`$233F34`, `$22DA70`, `$22DED4`,
`$12D430`, `$12CF80`, `$12D0AC`, `$172D18`) plus **`$22C5C0`**, which is a row of
the table at `$278338` — the four stream addresses immediately after the
`$278320` remap this wave exports — and belongs to a producer this wave did not
touch. Named rather than swept in.

### 7.2 THE FAILURE MODE, SEEN — and it names the shard by what it IS

Served with `spr/*.shard9.u16.gz` held back, the page **booted normally
(`spr 9/10`), ran the whole no-fire window for six seconds with no error at all,
and then stopped at logic frame 2886 — the first frame an enemy died — with:**

```
AN ASSET IS MISSING OR BROKEN.
This is not a crash and nothing about the port is wrong: a file the page needs
did not arrive, and it stopped rather than drawing a picture made of zeroes.

SPRITE SHARD 9 DID NOT LOAD (assets/spr/mask.shard9.u16.gz: HTTP 404 ...).
It holds 269 sprite streams -- THE ENEMY DEATH EXPLOSION: pool B's 68 script
entries at $221520/$221630, 23 distinct scripts of 12..36 cells each, walked the
way $288E4E and $288E20 walk them (W54). What happens when an enemy actually
dies. -- and a record has asked for one of them.
```

**That is the check that can only pass for the right reason**: the page itself
saying, unprompted, that an effect record exists and is asking for art — and
saying it on the exact frame the simulation first needs it, six seconds after
boot, not at boot. `demand()` raised it from inside that frame, which is
`BgShards`' contract (W47 §2.2) still holding for a shard built seven waves
later.

### 7.3 What I did NOT see, stated as a limit

**Nothing here is compared against MAME.** No gate in this repo compares the
port's own list against a board frame, and this wave did not build one. I have
proved the port asks for stream addresses the cartridge's own script tables
contain, that the bundle holds them, that they draw, and that they draw ONLY
when something dies. **A record with a correct descriptor can still be the wrong
record**, and whether this explosion looks like the board's explosion is
unmeasured.

### 6.4 THE ROM-LEAK GUARD FIRED, AND IT WAS RIGHT TO

`node tools/build-dist.mjs` **refused to build**:

```
REFUSING TO BUILD: dist/ contains verbatim cartridge data.
  games/ddpdoj/assets/spr/col.shard9.u16.gz  (444790 B, decompressed,
                                verbatim inside .../cave_a04402w064.u8)
```

W47 §3's finding, one shard on: [M] the 269 effect streams lie in one long
CONSECUTIVE run of `cave_a04402w064.u8` — a **different colour ROM** from the
three W47 hit — so the packed shard is a single verbatim slice. **The property
this guard tests is PACKING ORDER, not provenance**, and reordering the blocks
to make it quiet would be gaming it. W47's four answers, in its own order:
not an intermediate (`SprShards` fetches it); the COPY-that-should-be-a-
TRANSLATION is real and is a wave (decode the colour half, [M] −9.7 % gz,
`41-recon` §2.2 — it would retire all five lines); a SUBSTITUTE for 269 frames
of explosion is a different game; so it is `PUBLISH_VERBATIM`, with its reason,
printed on every build.

**`PUBLISH_VERBATIM` IS FIVE ENTRIES NOW AND WAS FOUR. That is a decision the
owner may want to reverse and it is flagged rather than buried**, exactly as W47
flagged one becoming four. `games/ddpdoj/assets/` is gitignored and every byte
of it is regenerated from the owner's own cartridge.

### 6.5 THE GATE, ON THE FINAL TREE

```
python games/ddpdoj/tools/oracle/pgm.py check
VERDICT: ALL GREEN -- 49 passed, 0 failed, 0 SKIPPED
```

Unchanged from W32..W53's 49/0/0. **Nothing was disabled, skipped, narrowed or
loosened**, and every stage line was read rather than only the verdict. The ones
this wave could plausibly have broken, all green:

- `display list: the staged-bytes replay gate (1,901 frames)` and its 12 REDs —
  the port's own `$800000` build, still byte-exact against the board. **Buckets
  0, 1, 2, 3 and 7 are not in `PRODUCED_BUCKETS`**, so pool B's writes do not
  enter the substituted set;
- `bullet mover: per-frame pool drive vs the board` and its 3 REDs;
- `fly-around: port vs board, 0 divergent frames` and its 5 REDs — the only
  2,200-frame port-vs-board window this project has. It never fires, so nothing
  dies and no effect can spawn; its green says this wave changed nothing on the
  no-input path, which is exactly what §2's 4,200-frame control predicts;
- `assets/integrity` and its four REDs, **including `[rom-byte]`**;
- `background shard gate: published tiles past px 160 (+ RED)` — the stage that
  fresh-exports, i.e. the one the exporter change had to survive;
- `pixel gate` (100.0000 %) and its 9 REDs; `demo gate` and its 4.

Also green on the final tree, and not part of `pgm.py check`:

```
node --test games/ddpdoj/tests/     697 pass, 0 fail, 0 SKIPPED   (was 666)
node games/ddpdoj/tools/webgate.mjs 11 of 11 PASS                 (was 10 of 10)
node games/ddpdoj/tools/bundlegate.mjs
                                    15955968/15955968 = 100.0000%  <- UNMOVED
node tools/build-dist.mjs           clean, 5 deliberate exception(s)  (was 4)
BUNDLE                              476.1 KiB before the first frame (was 472.0)
```

**THE GATE WAS RUN TWICE AND THE SECOND RUN IS THE ONE QUOTED**, for W47's own
reason: the first came back ALL GREEN but `tools/build-dist.mjs` gained its
fifth `PUBLISH_VERBATIM` entry afterwards. No gate stage reads that file, so the
first run was almost certainly still valid — and "almost certainly" is what W47,
W52 and W53 each threw a run away over.

**AND THE COMMITTED TREE IS A FEW LINES AHEAD OF THE ONE THE SECOND RUN SAW,
ALL OF THEM COMMENTS.** §8's nudge-escape correction went into
`src/effects.js` and a stale `spr n/9` count into `index.html`'s comments after
the run started; for both files `git diff -U0` filtered for lines that are not
`//` is EMPTY, and unit tests (697/0/0), `webgate` (11 of 11) and `bundlegate`
(100.0000 %) were all re-run on the final tree. That is stated rather than
glossed, because "only a comment" is exactly the sentence a wave regrets.

---

## 8. COVERAGE — branches and table entries, never frames

* **`$289004`'s call sites: 27 of 327 wired**, through 25 transcriptions — the
  damage-first family's three (`$26A616`/`$26A882`/`$26AD4A`) are the same
  instructions at three addresses and are written once, as `damageFirstHead`
  already is. **[M] 18 of the 27 are REACHED** in the 2,192-frame tapped run,
  over 22 distinct (kind, site) pairs — `$26B1E4` alone appears with five kinds
  because it walks the `$26B214` list.
  The other 300 are in handlers, bosses and `$2440E0` this port does not run;
  every one is behind an existing loud named throw or an unported handler, not
  behind a quiet return.
* **the 34+34 script entries: 68 of 68 EXPORTED**, 23 of 23 scripts, 269 of 269
  streams. **[M] 204 of the 269 REACHED** in a 2,192-frame tapped run.
* **the effect KINDS: 11 of 34 reached**, and 11 of 11 that the port's own
  ported arms can pass. The other 23 belong to arms this port does not run.
* **`$288FF0`'s emitter table: 5 of 5 entries EXPORTED AND ALL FIVE EXECUTED.**
  [M] over the 2,192-frame tapped run the five buckets carry 31,708 / 1,152 /
  4,926 / 15,195 / 3,457 records — selectors 0, 4, 8, `$C` and `$10` — so no
  entry is transcribed-and-unexercised.
* **`$288E20`'s two escape arms: BOTH exercised.** [M] the 23 distinct scripts
  contain **31 SIZE escapes and 27 NUDGE escapes**, and nine of the eleven
  reached kinds carry at least one nudge (`$3 $4 $5 $7 $9 $C $D $84 $85`; only
  `$1` and `$2` have none). **I nearly shipped the opposite claim** — the arm
  looked unexercised because no LIST OPENS with it, and it appears in the middle
  of a list instead. Counted rather than assumed, which is the whole rule.
* **transcribed and unexercised, named:** `$28900E`'s `blt` (provably
  unreachable, §0.3, not merely unmeasured);
  `$288F3A`'s friction (no death arm writes `($22,A0)`); `$288FBC`'s laser
  interlock (the beam is a named skip in these runs); and `$288E0C` itself,
  whose five callers are `$2440E0` (E5c), `$25FD40`, `$27C73A`, `$28B5B4`
  (inside type 5's "not started" branch, which the port throws for) and
  `$2A5A30`.
* **pool D: 0 of ~1,800 B ported, deliberately, and 0 slots allocated** (§4).
* **unit tests 666 → 697, 0 skipped.** New file `tests/w54effects.test.js`,
  30 tests. `webgate` 10 of 10 → **11 of 11**.

---

## 9. WHAT THIS WAVE DID NOT DO

- **Nothing is compared against MAME.** §7.3.
- **POOL D IS REFUSED, not ported.** §4 — and with it the secondary debris and
  six RNG draws per sub-spawn.
- **`$2440E0` (E5c) is not ported.** It is now a ~30-line port (it calls
  `$288E0C` and then `$289004` 39 times off the 624-byte table `$244ACE`, all
  four of whose kinds this wave already ships art for), but [M] recon 50 §10.1
  could not attribute its only non-boss caller `$275D10` and every other caller
  is a boss.
- **The impact pool A (`$27F8F8`/`$27F95A`) is untouched**, as W52 §0.2 left it.
- **`$289AF4`** — the "D0=$4 secondary" two death arms call — is still a counted
  note. It is a different allocator over a different pool.
- **The `$28Cxxx` family (`$28C25A`, `$28C274`, `$28C2A8`, `$28C2DC`,
  `$28C310`) is still counted.** W53 §0 established that family is SOUND.
- **`$22C5C0` has no art**, and it is not this wave's: it is a row of the table
  at `$278338`. §7.1.
- **`$26C1C4` is still the wall.** A tapped run reaches it at step 2,192,
  unchanged from W53 — this wave moves no RNG (§5).
- **Nothing was published.** The bundle on disk is the one that would ship;
  `tools/publish.mjs` deploys all three games and the deploy is the
  orchestrator's call.
- **`games/gradius/` was not touched.**

---

## LOG (appended as findings arrive)

- opened.
- §0.1 [M]: **recon 50's pool-B numbers reproduce EXACTLY** — 68 entries, 23
  scripts, 269 streams, 0 of 269 in the sheet, 218.4 KiB gz for all of them and
  195.8 KiB for its eight kinds, and both pool clears closing on their count word.
- §0.2 [M]: **SEVEN corrections.** The port's ported arms pass ELEVEN kinds and
  **all eleven are reached**, not eight; **the port's own note called type
  `$10`'s death kind `$7` and `$2681D6` says `$4`**; TEN sites arm pool D for
  TWO records and type `$11`'s DISARMS it again; recon 50's unresolved
  `$28925E` is reached by a branch, not a table; pool D is ~1,800 B and reads a
  window nothing pins; `$81C8EA` excludes spawn-delayed records; and
  **`($1a,A6)` is the SPEED and `($1b,A6)` the ANGLE, not the other way round.**
- §0.4 [M]: `$288E7A bset #6,(A6)` is a BYTE op on the HIGH byte -- $8000 ->
  $C000. Read as a word bit it lands inside the KIND.
- §1 [M]: pool B ported whole -- allocator, driver, walker, emitter table, both
  clears -- and 27 death-arm sites wired (25 transcriptions), each from its own listing.
- §2 [M]: **THE CENSUS. 23 of 80 slots at the high-water mark over 2,192 tapped
  frames; an independent 80-slot scan reconciles with `$81C8EA` on 2,192 of
  2,192 frames through `scan == count - freed + delayed`; 0 bit-bucket returns;
  402 frames back at ZERO and 265 of them consecutive; and the 4,200-frame
  no-fire control is 0 of 80 throughout.** 204 distinct streams, ALL with art.
- §3 [M]: **BOOT 472.0 -> 476.1 KiB, +4.1 KiB**, and every byte named: 1,781 B
  the `$221520` window (which CANNOT be deferred -- a missing ROM window throws
  where a missing stream is a named skip), 1,953 B seven more SPEED LEVELS
  (`$288F28` is a new reader of `$241D34` with a new index domain, DERIVED from
  the listing), 460 B the manifest. W53's two savings are already taken and
  base64 was already measured 14.4 KB worse.
- §3.1 [M]: **all 269 ship, not the 204 a run reaches** -- W53 1.3's decision
  one level up, and this wave's own run already reached three kinds recon 50's
  eight would have gone short on.
- §4 [M]: **POOL D IS REFUSED, NOT HALF-PORTED** -- W52 0.2's shape. [M] 0 of 20
  slots on every run including the 4,200-frame control, so it CANNOT leak.
  The cost is named: the secondary debris, and six RNG draws per sub-spawn.
- §5 [M]: **THE SCORING RE-MEASURED, not inherited.** 130 kills, `$00077515`
  pending, chain 304, meter 56/56, `$803916 = $C2` -- every column identical to
  W53's, **and the RNG column is evidence about THE REFUSAL, not about
  correctness**, because `$289098` would have drawn six times per sub-spawn.
- §6.1 [M]: 53 mutants, **53 named reds, 0 survivors, 0 skipped**, every restore
  byte-identical by sha256. **FIVE of my own checks could not fail when written
  -- and neither could the HARNESS**, which aimed every needle at an assertion
  MESSAGE where `node --test` prints only the test NAME. One DEFECTIVE MUTANT
  recorded (M29 was behaviourally a no-op).
- §6.2 [M]: four exporter assertions seen red against the CARTRIDGE -- **and one
  of them exists because the first attempt did not catch a short window.**
- §7 [M]: **THE OWNER'S WAVE, IN A REAL BROWSER. Big yellow-orange fireballs
  with ragged flame edges and a spray of sparks, where the enemies were -- and
  NONE of them on any sample of the same seed with fire never pressed.** With
  shard 9 withheld the page booted, ran the whole no-fire window with no error,
  and stopped at logic frame 2886 -- the first frame an enemy died -- naming the
  shard by what it holds. Both servers killed; zero orphans, zero listeners.
- §6.4 [M]: **the ROM-leak guard REFUSED TO BUILD** -- shard 9's colour body is
  a verbatim slice of `cave_a04402w064.u8`, a different colour ROM from W47's
  three, because the 269 effect streams are CONSECUTIVE there. Taken as
  `PUBLISH_VERBATIM` with a reason rather than reordering bytes to silence a
  guard. **The list went four -> five; that is the owner's call to reverse.**
- §6.5 [M]: **`pgm.py check` ALL GREEN 49/0/0, 0 SKIPPED**, on a clean re-run;
  unit tests 666 -> 697; `webgate` 10 of 10 -> 11 of 11; `bundlegate`
  15955968/15955968 = 100.0000 %, UNMOVED; `build-dist` clean with 5 exceptions.
- §8 [M]: **a coverage claim of mine was WRONG and was caught by counting it.**
  I had `$288E3E`'s NUDGE escape down as transcribed-and-unexercised because no
  script LIST OPENS with it; [M] the 23 scripts contain **27 of them**, in the
  middle of their lists, and nine of the eleven reached kinds carry one.

status: **DONE**
