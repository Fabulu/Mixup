# 58 - IMPL E3: THE ART. THE LASER FIRST.

status: **DONE** -- gate ALL GREEN 51/0/0, 706 unit tests, webgate 13/13, bundlegate 100.0000 % unmoved, PUBLISH_VERBATIM still 5. [M] records drawn 84.0 % -> 100.0 %, the beam 5.0 % -> 100.0 %, boot 476.3 -> 477.7 KiB.

started: 2026-08-05
role: IMPLEMENTER. I own **`games/ddpdoj/tools/`** and the ART PIPELINE (harvest,
shards, manifest, `export-web.mjs`). **M1 owns `games/ddpdoj/src/` this session
and I did not write there.** One `src/`-side finding is handed over in §7 rather
than fixed. `games/gradius/` NOT TOUCHED.

target: `ddpdojblk` VERSION-B. Every address is build B unless the line says
otherwise. `[M]` = measured by me, this session, on this tree.

brief: the owner, playing the live build - *"something fires. It looks like
shit. Laser looks like shit also and flickers. After initial tanks shots come out
of nowhere, tons of enemies completely invisible. We're missing something
massive"* - and `55-diag-invisible-content.md` measured that it is **missing
art**: 79.3 % of requested sprite pixels have no picture.

inputs read in full: `55-diag-invisible-content.md`, `47-impl-E2-art.md`,
`53-impl-E5a-spark.md`, `41-recon-sprite-art.md`, `HANDOVER.md`,
`docs/knowledge/09` and `10`.

---

## 0. THE HEADLINE

```
                                   BEFORE            AFTER
[M] display-list records          136,685           136,685
[M] DRAWN                    114,799 (84.0 %)  136,685 (100.0 %)
[M] sprite PIXELS                  498.3 M           498.3 M
[M] pixels with NO PICTURE   314.6 M (63.1 %)     0.0 M (0.0 %)
[M] distinct missing streams          145                 0
[M] BUCKET 16 -- THE BEAM      131 of 2,606        2,606 of 2,606
                                  (5.0 %)            (100.0 %)
[M] drawn % at f1000..1499         64.6 %            100.0 %
[M] BOOT (export-web's own)       476.3 KiB         477.7 KiB   (+1.4)
[M] deferred                      964.6 KiB       1,326.9 KiB   (+362.3)
```

Scenario, stated once and used for every before/after number above: the shipped
seed, 3,000 logic frames, **fly UP, tap fire every 4th frame, and two 120-frame
fire-HOLDS inside every 600** - the beam only exists while Button 1 is held, so a
tapped-only run measures almost nothing about it. Both runs used the page's own
`portSpriteList`, the page's own `romToPackedMap`, and **all** sprite shards
loaded (which is what `spr n/n` on the live status line means).

---

## 1. THE BRIEF'S PREMISE, CHECKED - the shape is right, and the biggest number
##    in it is a FLOOR that would have come straight back

`55-diag`'s structure reproduces. Everything below is `[M]` on my own scenario,
so the digits differ from the audit's; the SHAPE is identical and that is what
was being checked.

| `55-diag` / the brief says | `[M]` this session |
|---|---|
| bucket 16 is 8.2 % drawn, 29 of 33 descriptors absent | **CONFIRMED in kind.** [M] 5.0 % on my scenario, and **the 29 missing addresses are the same 29, address for address** |
| buckets 2/3/7 draw 0.0 %, 0.2 %, 0.0 % and carry 89.7 % of the miss | **CONFIRMED in kind.** [M] 0.0 %, 27.5 %, 36.1 % and **82.5 %** of my run's missing pixels. b3/b7 draw more here because the scenario differs, not because the finding moved |
| bucket 0 is 98.6 % fine | **CONFIRMED.** [M] 99.6 %, 4 distinct misses |
| drawn % collapses at f1000–1499 | **CONFIRMED.** [M] 93.9 → 86.1 → **64.6** → 85.0 → 91.7 → 86.0 |
| "7.8 KiB gz of LASER art takes the beam from 8.2 % to 100 %" | **THE PRICE IS RIGHT AND THE CLAIM IS NOT.** [M] the 29 cost **7.7 KiB**, and they take the beam to 100 % **at power 0 of 5, on the default ship, in one formation** |
| "all 220 missing streams resolve in the cartridge, 255.1 KiB gz" | **CONFIRMED in kind.** [M] my 145 all resolve; b2+b3+b7's 111 are **256.7 KiB** |
| b19's glow is 29 streams / 2.9 KiB, `$001F48 $0021AC $002188 $0023EC` missing | **NOT REPRODUCED.** [M] bucket 19 is **99.9 %** on my scenario with **two** distinct misses, and neither is a `$002xxx` glow frame - they are `$014D8C`/`$014E54`, LASER streams. The four glow addresses were emitted **zero** times in 3,000 frames here. I did not chase why; my scenario holds UP throughout and the audit's did not. **Not fixed, not claimed fixed** - §7 |

### 1.1 THE PREMISE THAT MATTERS: 29 IS ONE POWER LEVEL OF FIVE  `[M]`

The brief says do the laser first and names 29 addresses. **Shipping those 29
would have fixed the owner's screenshot and un-fixed itself the first time they
picked up a power-up.** Read out of the cartridge, not out of a run:

```
$254FF6..$255036  (laser.js beamRequest, $254FE6)
    d3 = ($22,A5)*4 + { 0 | $28 | $50 | $78 }        <- power, then ship/formation
    A1 = $24BB0A + d3
    ($10,A6) = low word of (A1)      = $1E           <- the animation cursor
    ($12,A6) = (A1+4)                                <- the animation BLOCK
$2550A0  subi.w #$a,($10,A6) / bcc / reload from ($18,A6)
$255086..$25509E  five words at BLOCK + cursor -> ($6,A6), ($a,A6), ($e,A6)
```

`($a,A6)` is the sprite descriptor. So the beam's art is **20 pointer entries ×
4 animation frames**, and three separate arithmetic facts close on each other:

```
[M] $24B7EA + 20*$28 == $24BB0A     the block array ABUTS the pointer table
[M] $24BB0A + 20*8   == $24BBAA     and $24BBAA no longer carries start $1E
[M] $1E + $A         == $28         four frames EXACTLY fill one block
[M] every one of the 20 entries carries start $1E and points INTO the array
```

**[M] Entry 0 - power 0, default ship, default formation - is
`$014D28 $014D8C $014DF0 $014E54`, and those are exactly the four "3x32" the
audit's list carries.** That is the derivation and the measurement meeting:
the audit measured one block of twenty.

The other nineteen entries are 60 more streams. Sixteen of the twenty entries
are distinct blocks; entries 15..19 all share `$24BAE2`.

### 1.2 AND A SECOND THING THE 29 HIDES: bucket 16 has TWO producer families

`55-diag` §4.2 is right that `$2550C6`/`$25514C` and the segment tail
`$2548BA` all reach `$23F508`. What it does not say is that **the two families
draw from completely different art**. [M] of the 29 measured addresses, **4** come
from the beam's `$24BB0A` chain and **25** come from the SEGMENT handlers, whose
`($a,A6)` is written by `hBody`, `hOnShip`, `hOnPod`, `scriptBody`,
`stepTemplate` and `startBeamRecords` reading the five template families packed
into `$24A86A..$24B7EA`. Those are power-indexed too (`hOnPod`:
`rom.u32(rom.u32(script + power*2))`).

---

## 2. WHAT SHIPPED, AND HOW EACH SET IS PINNED

### 2.1 shard 10 `laser` - 407 streams, 105.6 KiB gz, DEFERRED

Two mechanisms, because the cartridge lays the two families out two ways.

**(a) THE BEAM, WALKED.** `$24BB0A` entries **0..4** - the five POWER steps of
the default ship and formation - each walked to all four frames. **20 streams.**
The four assertions of §1.1 run on every export and any one of them stops the
build.

**(b) THE SEGMENTS, BOUNDED.** Every longword inside `$24A86A..$24B7EA` (the
laser's own contiguous data block) and `$24BBA0..$24C080` (the option block) that
is a **mask-ROM DIRECTORY entry**.

**THIS IS AN UPPER BOUND, NOT A CENSUS, AND IT IS LABELLED AS ONE IN THE
EXPORTER.** The justification is that a segment descriptor is only ever written
by `laser.js` reading one of those two windows, so **the port cannot ask for a
laser stream outside this set** - which is a completeness claim a table walk
could not make here, because the five families interleave scripts, anim tables
and $20-byte records with no single stride. The directory test is what keeps the
over-inclusion bounded: [M] **80 of 362** hits in the segment block and **28 of
195** in the option block are NOT directory entries and are dropped.

**AND THE CHECK THAT MAKES IT NON-VACUOUS**: the exporter asserts that all
**29** measured bucket-16 descriptors are inside the harvested set. A wrong
range, a wrong directory filter or a wrong beam walk drops some of them and the
build stops naming them.

**(c) bucket 0's last four**, `$22C59C..$22C6BC`, walked as a mask-ROM chain.
[M] 8 streams, and the run **closes exactly on `$22C6BC`** - which is where W53's
own LASER impact-spark list begins. The far end is the claim, `BULLET_RANGES`-style.

**WHAT IS DELIBERATELY NOT HARVESTED, named rather than omitted:**

* **`$24BB0A` entries 5..19** - the `+$28`/`+$50`/`+$78` groups, 60 streams,
  [M] 44 KiB. `+$28` needs `($58,A5)` (ship select) non-zero: `src/machine.js`
  records it as **[M] 0 for TYPE-A over the whole corpus** and nothing in the
  port writes it. `+$50` needs `($5a,A6) != 2` and `tools/export-tables.py`
  records **[M] 2 on every frame**. This is the `$268594` precedent - art for a
  state no ported code can enter.
* **and leaving them out is SAFE, which is a separate measurement** - §7.1.
* **the LASER's own impact spark** `$22C6BC..$22C860`, still behind the unported
  `$289F96`/`$289FC0`/`$289FDA` (W53 §6).

### 2.1b THE POWER LADDER - the coordinator's mid-wave question, from the ROM

Mid-wave the coordinator relayed the owner: *"laser and shots will likely also
need new updated sprites for powerups"*, with the warning that **every art
measurement in the brief was taken at BASE POWER** because items do not drop in
this build. **They are right, and §1.1 is the same finding arrived at from the
listing.** Here is the shape, read out of the cartridge, not out of a run.

**THE SHOTS - [M] FIVE power levels, 24 streams each, 71 distinct across all
five, and 47 of the 71 are reachable ONLY above power 0.**
`$249C48`/`$24D4F8` index by `($20,A6)*2` over `{0,2,4,6,8}` into four template
tables (`$2554EA` `$255502` `$24D2FC` `$24D35C`), and each power's template
names three separate chains (spawn `+$0A`, per-frame `+$1E`, hit re-point).
[M] every power picks a **different** template and mostly different art:

```
[M] power 0 $24DA20 $004970..   power 3 $24DB04 $004A98..
[M] power 1 $24DA6C $0049A8..   power 4 $24DB50 $004B90..
[M] power 2 $24DAB8 $004A10..
[M] power 0 alone 2.3 KiB gz    powers 1..4 add 8.6 KiB
```

**AND ALL 71 HAVE SHIPPED SINCE W52.** `SHOT_POWERS = [0, 2, 4, 6, 8]` walks the
whole ladder, and [M] all 47 of the above-base streams are already in the bundle.
**The shots need nothing.** W52 got this right and its worklog did not say so;
this is the measurement that says it.

**THE BEAM - [M] FIVE power levels, 4 frames each, 20 distinct, and 16 of the 20
are reachable ONLY above power 0.** And it is not a recolour: the beam GROWS.

```
[M] power 0  block $24B7EA  $014D28 $014D8C $014DF0 $014E54   3x32
[M] power 1  block $24B812  $014EB8 $014F5C $015000 $0150A4   4x40
[M] power 2  block $24B83A  $015148 $01523C $015330 $015424   5x48
[M] power 3  block $24B862  $015518 $01566C $0157C0 $015914   6x56
[M] power 4  block $24B88A  $015A68 $015BEC $015D70 $015EF4   6x64
[M] power 0 alone 1.7 KiB gz     powers 1..4 add 13.3 KiB
```

**W58 SHIPS ALL TWENTY.** The audit's 29 are power 0's four plus the segment
side; shipping only those would have left **13.3 KiB and sixteen frames** absent
the moment the player powered up - a beam that grows from 3x32 to 6x64 and has
art for one of the five sizes.

**The SEGMENT side is power-indexed too** (`hOnPod` reads
`rom.u32(rom.u32(script + power*2))`), and §2.1(b)'s bounded-block harvest covers
every power **by construction** rather than by enumeration: it takes every
directory-valid stream in the two blocks those scripts live in.

**SO, PRECISELY, WHAT "100 % LASER COVERAGE" MEANS HERE** - and this is the
sentence that must not be read as broader than it is:

* **MEASURED 100 %** - bucket 16 draws 2,606 of 2,606 records - is over a run
  **at base power**, because nothing in this build powers the ship up.
* **HARVESTED** - the bundle contains the art for **all five power steps** of
  the beam and of the shots, and for the segment blocks at every power.
* **NOT harvested, and named**: the `+$28`/`+$50`/`+$78` ship/formation groups
  (60 beam streams, [M] 44 KiB) - §2.1 and §7.1.
* So the honest sentence is: **"the beam has art for every power level the
  cartridge's own table can index for the default ship and formation, and a
  base-power run draws 100 % of it."** Not "the laser art is complete."

### 2.2 shard 11 `structures` - 146 streams, 262.3 KiB gz, DEFERRED

Buckets 2, 3 and 7: the big background structures, the midboss and the large
emplacements. [M] **82.5 % of every missing sprite pixel** in my run and the
audit's 89.7 % in its own. This is the 288x208 hole in the middle of the
playfield.

**IT STARTED AS A MEASURED FLOOR AND THE BROWSER CAUGHT IT GOING SHORT WITHIN
THIRTY SECONDS.** With the 111 measured addresses shipped, [M] the live local
page still named `$1567D4 $156ABC $156B38 $155C34` - four neighbours of the
twelve the run reached, in the same uniform run. That is `46-diag`'s tank hulls
happening again, found by opening the page rather than by a gate.

**[M] So four of the families are CLOSED CHAINS now, sized by the cartridge:**

| range | streams | what closes it |
|---|---|---|
| `$11E1FC..$127E7C` | **32** | stride 1252 (13x96) → `$127E7C` is stride 3748 |
| `$12C7B0..$12D430` | **32** | stride 100 (3x32) → `$12D430` is stride 68 |
| `$151E10..$152A90` | **32** | stride 100 (3x32) → stride 228 |
| `$155C34..$156BB4` | **32** | stride 124 (3x40) → `$156BB4` is stride 484 |

All four are **32-frame animations**, walked with `BULLET_RANGES`' mechanism -
`endsAt` IS the claim and a chain that steps over it stops the build - and it
cost **6.7 KiB gz for 35 more streams**. **Eighteen one-off structures remain an
explicit measured list**, because each is a large single picture reached from a
background-element immediate with no uniform run around it to close on. That
half is still a floor and the exporter says so in those words.

**TWO CORRECTIONS TO THE AUDIT, both from the chain itself:**
* `55-diag` §2.2 calls `$12C7B0..$12D3CC` "a **38**-frame animation run".
  [M] It is **32**, and it ends at `$12D430` - which the audit lists separately
  as the port's single worst-missing stream and is in fact the first frame of
  the *next* family.
* `55-diag` §2.2 calls `$155D2C..$1569C4` "a **16**-frame 3x40 c12 run".
  [M] It is **32**, and it starts `$DC` lower, at `$155C34`. Shipping the 16
  would have left the page naming the other sixteen.

### 2.3 DELIVERY - what it cost, and the alternative that was rejected

| | streams | gz |
|---|---|---|
| the 29 the audit measured (the minimum that fixes the owner's screenshot) | 29 | **7.7 KiB** |
| **shard 10 as shipped** - the 5-power ladder + both bounded blocks | 407 | **105.6 KiB** |
| **shard 11 as shipped** - buckets 2/3/7, 4 closed chains + 18 one-offs | 146 | **262.3 KiB** |

**7.7 KiB was rejected and the reason is `docs/knowledge/09`.** A harvest sized
off what one run reached is exactly the tank-hull mistake (`46-diag`): it fixes
the screenshot and goes blank the first time the player powers up, which happens
in the first minute of any real game. 105.6 KiB is DEFERRED, so it costs boot
nothing (§3), and `demand()` promotes it the instant a record asks.

`SPR_ORDER` is now `[0, 7, 6, 10, 9, 8, 1, 2, 3, 4, 5, 11]`:

* **shard 10 goes THIRD** among the deferred - behind the bullets (+0.7 s) and
  the shots (the first fire frame), ahead of the 218 KiB explosion - because the
  player can hold fire on frame one and this is the owner's most-repeated
  complaint. [M] its first record in the gate's own window is frame 24.
* **shard 11 goes LAST by index and it costs nothing**, because [M] its first
  need is +5.3 s and `demand()` promotes whichever shard the simulation actually
  reaches first, exactly as it has since W47.

---

## 3. BOOT, BEFORE AND AFTER - IT WENT UP, BY 1.4 KiB, AND HERE IS EVERY BYTE

```
[M] BOOT BEFORE   476.3 KiB   (export-web.mjs's own figure, HEAD = edaa6cd)
[M] BOOT AFTER    477.7 KiB   -- +1.4 KiB
[M] deferred      964.6 -> 1,326.9 KiB   (the 362 KiB of new art)
```

Four consecutive waves took boot DOWN while adding art (475.2 → 473.7 → 473.2 →
472.0) and W54/W57 took it to 476.3. **This wave puts 1.4 KiB back and it is
structural, not slack:**

* **+1.0 KiB `manifest.json`** - 8,182 → 9,208 B. The manifest is the one body
  served **UNCOMPRESSED** (W47 §2.4), so every byte of it is a boot byte. Two
  new shard entries carry their `why` prose, which is what the page prints in
  "SPRITE SHARD n DID NOT LOAD - it holds N streams - …", and three new harvest
  ledger rows. **I trimmed both after measuring**: the first draft of the two
  `why` strings cost 1,175 B and the shipped ones cost 1,026 B.
* **+0.4 KiB `spr/streams.u32.gz`** - the stream table went 1,052 → 1,570
  entries. Planar and delta-coded since W52, so 518 more streams cost 0.4 KiB.

**There is no version of this wave with a flat boot.** Adding a shard means
adding its metadata to the one uncompressed file, and adding art means adding
its rows to the stream table. The claw-backs W47 and W53 used (moving the stream
table out of the manifest; deleting the manifest's indentation) are both already
taken. The next one available is gzipping `manifest.json` itself, and that is a
`src/web/assets.js` change - **not mine this session**, named in §7.

---

## 4. EVERY CHECK SEEN TO FAIL

### 4.1 Ten mutants, ten named reds, every restore byte-identical

`node games/ddpdoj/.scratch/mutate58.mjs`: apply ONE edit, run ONE command,
require a NAMED red, restore, **verify the file's sha256 is byte-identical**.
Every restore matched.

| # | mutation | what went red |
|---|---|---|
| M1 | the beam pointer table claimed as 24 entries | `the beam's block array $24b7ea + 24 x $28 does not land on the pointer table` |
| M2 | the block array based one block high | the same abut assertion |
| M3 | the animation read as THREE frames (start `$14`) | `walks from $14 down in steps of $a, which does not fill a $28-byte block exactly` |
| M4 | the segment block cut at family 3 - **`46-diag`'s own mistake** | `does NOT contain 21 of the 33 descriptors a 3,000-frame playing run measured bucket 16 asking for: $01447c $0144e0 …` |
| M5 | the mask-ROM DIRECTORY filter dropped | `SpriteDirError` out of `romExtent` on the first false positive |
| M6 | the `$22C59C` run claimed to end one stream late | `the $22c59c run steps OVER $22c6c0` |
| M7 | the structures list truncated by one | `STRUCTURE_STREAMS holds 17 addresses …; W58 measured 18 and 4` |
| M8 | the laser folded into the BOOT shard | `SHARD 0 IS THE BOOT SHARD` |
| M9 | the fetch order back to W54's | `SPR_ORDER … is not a permutation of the 12 sprite shards` |
| M12 | the `SPR_ORDER` assertion loosened in the unit test | `not ok - the two weapon shards are DEFERRED and fetched FIRST among the deferred` |

**AND ONE MUTANT WAS DEFECTIVE, recorded rather than quietly repaired.** M6's
first form claimed the run ended at `$22C6E0` - which **is** a stream boundary,
so the walk closed on it and the mutant `*** SURVIVED ***`. A wrong end address
that happens to land on a boundary is not a wrong end address the check can see.
Re-aimed at `$22C6C0`, which is not one, and it goes red. That is the survivor
doing its job.

### 4.2 The GATE STAGE, seen to fail against the REAL bundle

`node games/ddpdoj/.scratch/gatemut58.mjs` - cut the harvest, re-export, run
`webgate`, restore, re-export, hash-check. `export-web.mjs` byte-identical after.

| cut | what the stage printed |
|---|---|
| **the beam harvest cut to pointer entry 0 - the ONE block the audit measured** | `FAIL: W58 THE LASER BEAM … sprite shard 10 holds 391 streams (expect 407) …` |
| the structures harvest ten streams short of its own list | `FAIL: W58 THE BIG MID-SCREEN STRUCTURES … holds 101 streams (expect 146) and the port's own $800000 list carries 8103 records of them (expect 12681) over 95 distinct images (expect 101), first at frame 346 (expect 315)` |

**Each cut left the OTHER stage green**, which is what says the two are
independent rather than one number wearing two labels.

**W47 §4.1's TRAP, avoided the same way it was found:** `records`, `distinct` and
`first` are the PORT's own and no bundle can supply them; only `streams` comes
from the bundle. A stage that asked "is everything shard 10 holds drawn?" would
have reported `1736 drawn of 1736` and PASSED on both cuts above.

### 4.3 A TOOL THREE WAVES PRICED THEIR HARVESTS WITH HAS BEEN WRONG SINCE W52

Not a defect in shipped code, and worth more than most of what is: it is a check
that **could not fail**.

`.scratch/e4price.mjs` (W52's, reused verbatim by W53 and W54) builds its
"already in the sheet" set by reading `assets/spr/streams.u32.gz` as
**interleaved** `[rom, base, words]` triples. [M] W52 made that file **planar and
delta-coded** (`manifest.spr.streamsFormat === 'planes-delta-1'`, decoded in
`src/web/assets.js:643`). So the old reader produces **61 garbage addresses for a
1,052-stream bundle**, and

> **[M] every "0 ALREADY in the sheet" line in W52, W53 and W54's pricing is
> vacuous - it would have printed 0 whatever the bundle contained.**

The prices those waves quote are therefore UPPER bounds, not wrong ones (the
streams really were new - I re-checked W53's 36 and W54's 269 against a correct
decode and both are 0-already for real). But nobody could have known that from
the tool. Replaced by `.scratch/e3price.mjs`, which decodes the file **the way
the page does**; on my own laser list it correctly finds **4 already present**
where the old tool said 0.

---

## 5. THE PAGE, IN A REAL BROWSER - WHAT I SAW  `[M]`

Chrome + Python `playwright`, W42's recipe. Nothing downloaded. **BOTH the LIVE
DEPLOYED BUILD and the local one**, the same script, the same key presses.
**The server I started was killed and [M] `Get-CimInstance Win32_Process` finds
zero `http.server` processes and port 8781 free** - checked by process and by
listening port, not by "did I start it", because W53's sweep found an orphan the
GATE had left.

### 5.1 BEFORE - `https://gbtman.pages.dev/games/ddpdoj/`, build with `spr 10/10`

```
[M] BOOTED     [port] dl 61 drawn 55 ... NO ART 6:  $233F34x1 $22DA70x1 $22DED4x1
[M] HELD8      [port] dl 71 drawn 43 ... NO ART 28: $12D110x8 $12D430x8 $233F34x1
[M] LATE       [port] dl 96 drawn 76 ... NO ART 20: $12D110x8 $12D430x8 $22DED4x1
```

* **[M] HOLDING FIRE, EIGHT CONSECUTIVE SCREENSHOTS: NOT ONE OF THEM HAS A
  BEAM.** The gauge reads `MAX`, so the laser is charged; there is simply
  nothing drawn above the ship on any of the eight. That is the owner's
  "flickers" at its limit - the art for its current animation step is absent on
  29 of the beam's 33 steps.
* **[M] A HUGE BLACK RECTANGLE fills most of the upper-middle playfield**, with
  the ship, the tanks and the enemy bullets floating in it. That is the owner's
  "tons of enemies completely invisible", and it is the b2/b3/b7 art.

### 5.2 AFTER - the same script, the same keys, locally

```
[M] BOOTED     [port] dl 63 drawn 63 ... spr 12/12   (no NO ART line at all)
[M] HOLD       [port] dl 47 drawn 47 ... spr 12/12
[M] HELD8      [port] dl 34 drawn 34 ... spr 12/12
[M] LATE       [port] dl 84 drawn 84 ... spr 12/12
[M] LATE+HOLD  [port] dl 74 drawn 74 ... spr 12/12
```

**`drawn` equals `dl` on every single sample and the page never prints `NO ART`.**

* **[M] THE BEAM IS A SOLID FULL-LENGTH COLUMN.** Sitting low and holding fire,
  eight consecutive screenshots: **an unbroken orange-red beam runs from the
  ship's nose to the top of the playfield**, with a flame head where it lands,
  in **five of the six frames I examined** (`f0 f2 f4 f6 f7`; `f1` has none).
  In `f4` it is planted on the midboss aircraft with pink impact flashes around
  the contact point; by `f6`/`f7` that aircraft is a full-screen explosion.
  **On the deployed build the same experiment produced zero beams in eight.**
* **The one frame in six with no beam is the `$80390C` 50 % duty cycle**, which
  `55-diag` §4.2 measured as the BOARD's own transparency trick and the port
  reproduces exactly. **The art was the bug; the phase is a fidelity decision and
  I did not touch it.** Whether it still reads as strobing to the owner is now
  the only open half of that question, and it is answerable by asking them.
* **[M] THE BLACK HOLE IS GONE.** The same late window that was a black
  rectangle is now a complete picture: tiled roofs, a brick building with a
  painted poster on it, stone steps, foliage, a road with tanks driving on it.
* **[M] AND THE FIRST LOCAL RUN FOUND THE DEFECT §2.2 IS ABOUT.** With the
  measured 111-address list shipped, the page still printed
  `NO ART 1: $1567D4x1`, then `NO ART 2: $156ABCx1 $156B38x1`, then
  `NO ART 4: $156B38x2 $155C34x2` - four streams no headless run of mine ever
  asked for. **Nothing but opening the page was going to find that**, and it is
  what turned four measured lists into four closed chains.

---

## 6. THE GATE, ON THE FINAL TREE

```
python games/ddpdoj/tools/oracle/pgm.py check
VERDICT: ALL GREEN -- 51 passed, 0 failed, 0 SKIPPED
```

51, not W54's 49, because **W57 added two stages** (`midboss DEATH` and its
`RED [no-kill]`) between that wave and this one. **Nothing was disabled,
skipped, narrowed or loosened here**, and every stage line was read rather than
only the verdict. The ones this wave could plausibly have broken, all green:

- **`assets/integrity` and its four REDs, including `[rom-byte]`, THE ROM-LEAK
  GUARD** - four new shard files went through it;
- `pixel gate: the port's JS renderer vs MAME` (100.0000 %) and its 9 REDs;
- `background shard gate: published tiles past px 160 (+ RED)` - the stage that
  FRESH-EXPORTS, i.e. the one an exporter change has to survive;
- `display list: the staged-bytes replay gate (1,901 frames)` and its 12 REDs;
- `fly-around: port vs board, 0 divergent frames` and its 5 REDs;
- `midboss DEATH` and `midboss DEATH RED [no-kill]` - W57's, and [M] I confirmed
  the stage is indifferent to this wave by running it against **both** bundles:
  0 failed assertions on the W58 bundle and 0 on the saved pre-W58 one.

Also green on the final tree, and not part of `pgm.py check`:

```
node --test games/ddpdoj/tests/       706 pass, 0 fail, 0 SKIPPED
node games/ddpdoj/tools/webgate.mjs   13 of 13 PASS              (was 12)
node games/ddpdoj/tools/bundlegate.mjs
                                      15955968/15955968 = 100.0000%  <- UNMOVED
node tools/build-dist.mjs             clean, 5 deliberate exception(s)  <- UNMOVED
BUNDLE                                477.7 KiB before the first frame (was 476.3)
```

**A FIRST GATE RUN WAS THROWN AWAY, and the reason is worth recording because it
is not W47's or W53's.** It came back with `W57 midboss-death` red. **That was
not my wave and it was not W57's either**: the run started at 06:19 but I had
launched an *earlier* one while M1's `src/handlers.js` was still dirty, and I
read the two logs' tails as if they were the same run. [M] Run standalone
immediately afterwards the stage passes on the W58 bundle AND on the pre-W58
one, and the 51/0/0 above is a clean run on the committed tree. **The lesson is
the one `HANDOVER` §10 gives for two agents and which applies just as well to one
agent with two log files: a gate started before the tree settled is not evidence
about the tree.**

---

## 7. WHAT THIS WAVE DID NOT DO, AND ONE HANDOVER TO `src/`

### 7.1 A LATENT CRASH IN THE EXPORTED ROM WINDOWS - found, measured, NOT fixed

[M] `tools/export-tables.py`'s W45 windows are `$24A800+$1100` (which stops at
**`$24B900`**) and `$24BB00+$A0`. **The beam's animation blocks for pointer
entries 7..19 live at `$24B902..$24BB0A`, inside that hole.** So if
`($58,A5)`/`($5a,A6)` ever leave their measured values, `$255086`'s
`rom.u32(ptr + off + 4)` reads an unexported address and `src/rom.js` throws
`$24B902 IS NOT PORTED YET`.

**That is the correct behaviour and I deliberately left it.** Widening the window
without the art would convert a loud named throw into a quiet `NO ART` skip; the
window and the harvest must move together and neither moves in this wave. It is
recorded here so the next reader does not "fix" half of it. The exporter's own
comment block says the same thing.

### 7.2 Handed to whoever owns `src/` next

* **`manifest.json` is served uncompressed** and is now 9.2 KB of boot. Gzipping
  it (a `src/web/assets.js` change plus one line in `export-web.mjs`) is worth
  roughly 6 KiB of boot and would pay for this wave four times over.
* **bucket 19's four glow frames** (`$001F48 $0021AC $002188 $0023EC`,
  `55-diag` §5/§6) are **not shipped**: [M] my scenario emits them zero times in
  3,000 frames, so I have no measurement that they are needed and no table that
  says they are reachable. `55-diag` §6 makes them a testable prediction about
  what the owner remembers as a hitbox marker; that prediction is still untested.

### 7.3 Limits

* **Nothing here is compared against MAME.** No gate in this repo compares the
  port's own display list against a board frame. I have proved the port asks for
  stream addresses the cartridge's own tables and data blocks contain, that the
  bundle now holds every one of them, and that every record draws. **A record
  with a correct descriptor can still be the wrong record.**
* **One scenario.** 145 missing streams was a floor for that scenario;
  0 missing is a statement about the same scenario, not about the game.
* `games/gradius/` NOT TOUCHED. `games/ddpdoj/src/` NOT WRITTEN TO.

---

## 7b. THE OWNER'S SHADOW FLICKER - **(A) AUTHENTIC. DO NOT "FIX" IT.**

Mid-wave the owner asked: *"some enemies' shadows flicker. Don't know if that's
in the original but we have to check"*, and the coordinator set out the three
answers - (A) the board's own alternate-frame transparency, (B) missing art,
(C) an emission defect - with the instruction to settle it from the board and
not from the genre.

**[M] IT IS (A), AND THE BOARD IS UNAMBIGUOUS.** `capture.bin` is 161 frames of
the real machine's post-DMA sprite buffer. Every ground shadow on this board is
colour 24 (`[M]` the board uses `c10:6166 c0:653 c24:281 c26:217 c11:174 c9:100
c2:80` in that window, and c24 is used by these four classes and nothing else):

| class | on N of 161 frames | lf EVEN | lf ODD | consecutive gaps |
|---|---|---|---|---|
| `1x16 c24 p0 f0` THE SHIP'S SHADOW | 81 | **81** | **0** | +1 x**0**, +2 x**80** |
| `1x8 c24 p0 f0` option shadow | 81 | **81** | **0** | +1 x**0**, +2 x**80** |
| `1x8 c24 p0 f2` option shadow | 81 | **81** | **0** | +1 x**0**, +2 x**80** |
| **`2x16 c24 p0 f0` AN ENEMY'S SHADOW** | **27** | **27** | **0** | +1 x**0**, +2 x**26** |

```
[M] shadow records per BOARD frame, first 40:  3 0 3 0 3 0 3 0 3 0 3 0 ...
[M] board frames carrying NO shadow record at all: 80 of 161
[M] every shadow record in the capture is on an EVEN logic frame: TRUE
[M] every shadow record in the capture is on an ODD  logic frame: FALSE
```

**Not one shadow record on the real machine ever appears on two consecutive
frames.** Every gap between consecutive appearances is exactly +2, 80 of 80 and
26 of 26. **The enemy's shadow obeys the same rule as the ship's.** That is the
alternate-frame 50 %-transparency trick on hardware with no alpha blending, and
`src/render/capture.js` has documented it since W12 - this is the first time it
has been measured for an ENEMY's shadow specifically, which is what the owner
asked about.

**THE FLICKER IS THE CARTRIDGE. Supplying more art or drawing shadows every
frame would REMOVE authentic behaviour and look like an improvement.** The
precedent is Batman's water dither: a deliberate, documented, owner-owned
fidelity decision. Nobody should "correct" this without the owner saying so.

**AND THE SECOND HALF, WHICH IS THE ONE THAT COULD HAVE HIDDEN A REAL DEFECT -
the port's cadence is right too.** [M] 1,200 frames, the port's own bucket 5:

```
[M] bucket-5 records per frame, first 40:  3 0 3 0 3 0 3 0 3 0 3 0 ...
[M] frames with NO bucket-5 record: 600 of 1,200 = 50.0 %
[M] frames WITH one, by logic-frame parity: EVEN 600 / ODD 0
```

**Three records on exactly every other frame, on the EVEN parity, never two in a
row - the board's phase and the board's duty cycle, both exact.** Flickering at
the wrong cadence would have been a real defect wearing a correct-looking one,
and it is not happening.

**ONE THING WAS (B) AS WELL, AND THIS WAVE FIXED IT.** [M] Before W58, bucket 5
drew **3,440 of 3,970** records - 86.6 % - because **`$065388`, the option pod's
own ground shadow, had no picture at all** (530 records over 3,000 frames). So on
top of the authentic 50 % alternation, that shadow was additionally absent on
every one of its own frames. It is `$24C906`'s twelve-byte template pair -
`($a,A6)` is the pod muzzle `$065354`, which has shipped since W45, and
`($5c,A6)` is the shadow beside it, which had not. Shard 10's option-block scan
picks it up. [M] Bucket 5 is now **3,970 of 3,970**. **The authentic flicker
stays; the missing picture is gone.**

## 8. THE DONE-WHEN, EACH AS A MEASUREMENT - and exactly what each one CLAIMS

| the brief asks for | `[M]` |
|---|---|
| laser art coverage → 100 %, flicker gone | **bucket 16: 131 of 2,606 (5.0 %) → 2,606 of 2,606 (100.0 %)**, and in Chrome a **solid full-length beam on five of six consecutive held-fire frames where the deployed build had zero in eight**. §5. **This is 100 % AT BASE POWER** - see below |
| overall drawn %, before and after | **84.0 % → 100.0 %** of records; **63.1 % → 0.0 %** of sprite PIXELS; 145 → 0 distinct missing streams |
| ... specifically at f1000–1499 | **64.6 % → 100.0 %** |
| boot before and after | **476.3 → 477.7 KiB, +1.4 KiB**, every byte named. §3 |
| gate ALL GREEN, unit tests | **ALL GREEN -- 51 passed, 0 failed, 0 SKIPPED** (51 and not 49 because W57 added two stages); **706 unit tests, 0 skipped**; **webgate 13 of 13** (was 12). §6 |
| `bundlegate` 100.0000 % unmoved | **15955968/15955968 = 100.0000 %.** Shard 0 was not touched, so `capture.bin` is byte-identical and this number could not have moved |
| ROM leak guard intact, `PUBLISH_VERBATIM` named if it grows | **STILL FIVE. It did not grow.** [M] neither shard 10 nor shard 11 is a verbatim ROM slice, because each packs several disjoint runs - the same accident of packing order W47 §3 explains, and it is luck rather than virtue, stated as such |

**AND THE SENTENCE THAT MUST NOT BE OVER-READ.** "100 % laser coverage" here
means: **over a 3,000-frame playing run at BASE POWER, every record bucket 16
emits has a picture.** Items do not drop in this build, so no run can power the
ship up and no measurement in this project has ever seen power 1..4 emitted.
What is *harvested* is broader than what is *measured*: the bundle contains the
art for **all five power steps** of the beam (§2.1b) and of the shots (W52), and
for the segment blocks at every power by construction. What is **not** there is
the `+$28`/`+$50`/`+$78` ship/formation groups. **Nobody should read this wave
as "the laser art is complete."**

## LOG (appended as findings arrive)

- opened.
- §1 [M]: the audit's shape reproduces - b2 0.0 %, b16 5.0 %, b0 99.6 %, the
  f1000–1499 collapse, and **the same 29 bucket-16 addresses**.
- §1.1 [M]: **THE 29 ARE ONE POWER LEVEL OF FIVE.** The beam's art is
  `$24BB0A` x20 entries x4 frames, and three arithmetic facts pin it:
  `$24B7EA + 20*$28 == $24BB0A`, `$24BB0A + 20*8 == $24BBAA`, `$1E + $A == $28`.
  Entry 0 is exactly the four addresses the audit lists as "3x32".
- §1.2 [M]: bucket 16 has TWO art families - 4 of the 29 are the beam's, 25 are
  the SEGMENT handlers' out of `$24A86A..$24B7EA`.
- §2.2 [M]: `55-diag` §2.2's "38-frame run `$12C7B0..$12D3CC`" is **32** frames.
- §4.0 [M]: **`.scratch/e4price.mjs` has been wrong since W52** - it reads the
  planar delta-coded stream table as interleaved triples, so every
  "0 ALREADY in the sheet" line in W52/W53/W54 was vacuous. Replaced.
- §7.1 [M]: **a latent crash found and deliberately not fixed** - the beam's
  blocks for pointer entries 7..19 are in an unexported ROM window hole
  (`$24B900..$24BB0A`), so those states throw loudly rather than drawing wrong.
- §0 [M]: **THE RESULT. 84.0 % -> 100.0 % of records drawn, 63.1 % -> 0.0 % of
  sprite pixels with no picture, 145 -> 0 distinct missing streams, bucket 16
  5.0 % -> 100.0 %, and f1000–1499 64.6 % -> 100.0 %.**
- §3 [M]: **BOOT 476.3 -> 477.7 KiB, +1.4 KiB**, every byte of it accounted for
  (manifest +1.0, stream table +0.4) and the `why` strings trimmed after
  measuring.
- §4.1 [M]: 10 mutants, **10 NAMED reds**, every restore byte-identical by
  sha256 -- and **one DEFECTIVE mutant recorded**: a wrong end address that
  happens to land on a stream boundary is invisible to the chain check.
- §4.2 [M]: **BOTH gate cuts SEEN RED against the real bundle** -- 391 vs 407
  with the beam cut to the one block the audit measured, and 101/8103/95/346 vs
  146/12681/101/315 with the structures cut. Each cut left the other stage green.
- §5 [M]: **THE OWNER'S WAVE, IN A REAL BROWSER, BOTH BUILDS.** On the LIVE
  DEPLOYED page, eight consecutive held-fire frames with the gauge at MAX and
  **not one beam**, under a black rectangle filling the upper playfield. On the
  local build, **a solid full-length beam on five of six**, planted on the
  midboss with impact flashes, over a complete picture -- roofs, a brick
  building with a painted poster, stone steps, foliage, tanks on a road.
  `drawn == dl` and no `NO ART` line on any sample. Server killed; [M] zero
  `http.server` processes and port 8781 free, checked by process AND by port.
- §2.2 [M]: **THE BROWSER CAUGHT THE MEASURED FLOOR GOING SHORT** -- with the
  111-address list shipped the page still named `$1567D4 $156ABC $156B38
  $155C34`. Four families are CLOSED CHAINS now, [M] 32 streams each, ended by a
  stride change, +6.7 KiB. And `55-diag` §2.2 is wrong twice: the `$12C7B0` run
  is 32 frames not 38, and the 3x40 run is 32 not 16 and starts $DC lower.
- §2.1b [M]: **THE COORDINATOR'S POWER-LADDER QUESTION, ANSWERED FROM THE ROM.**
  The SHOTS: 5 levels, 24 streams each, **71 distinct, 47 of them above base --
  and all 71 have shipped since W52**. The BEAM: 5 levels x 4 frames, **20
  distinct, 16 above base, and the beam GROWS 3x32 -> 6x64** -- all 20 ship in
  this wave. Power 0 alone would have been 1.7 KiB of 15.0.
- §7b [M]: **THE OWNER'S SHADOW FLICKER IS THE CARTRIDGE'S OWN. (A), settled
  against the board.** All 161 captured frames: every colour-24 shadow record --
  the ship's, both pods' AND AN ENEMY'S -- is on an EVEN logic frame, 189 of
  189, and **not one ever appears on two consecutive frames** (every gap is
  exactly +2, 80 of 80 and 26 of 26). 80 of 161 board frames carry no shadow at
  all. **It must NOT be "fixed".** And the port's cadence is exact: [M] 3
  records on every other frame, EVEN 600 / ODD 0 over 1,200 frames.
  **But one shadow was ALSO (B)**: `$065388`, the pod's own ground shadow, had
  no picture -- bucket 5 was 86.6 % and is now 100 %.
- §8: **the done-when, and the sentence that must not be over-read**: 100 % is
  measured AT BASE POWER; all five power levels are HARVESTED. Those are two
  different claims and both are stated.


status: **DONE**
