# W35 - RECON (+IMPL if clear): the SPRITE ATLAS - where do the 166 streams come from?

status: **DONE** - see §8.
wave: 35. role: RECON + IMPLEMENTER (sole writer to `games/ddpdoj/`).
date: 2026-08-04.
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Build B = `$23xxxx..$2Axxxx`.
Any build-A address is flagged as such.

## THE BRIEF, AND ITS PREMISE

W28 §6 concluded: *"The largest unknown is not the boss. It is item 4 - whether
every sprite the stage draws can be enumerated by address from the ROM."* The
current atlas is **166 sprite streams enumerated from the RECORDING's own
display list**, and no wave has been assigned to replace that provenance. That
is what gates deleting `capture.bin`.

Order of work:

1. Characterise precisely where the 166 come from today (file, code path, data).
2. Determine what in the ROM decides which streams exist for stage 1, with a
   real denominator counted from the ROM.
3. Compare the ROM-derived set against the recording-derived set. Report BOTH
   sets and their difference explicitly, never as a percentage.
4. Port ONLY if the ROM path is clear. Otherwise stop and write down exactly
   what blocks it.

**Do not delete or shrink `capture.bin` this wave.**

---

## 1. WHERE THE 166 COME FROM TODAY - measured, not cited

`games/ddpdoj/tools/export-web.mjs`:

| line | what |
|---|---|
| 154 | `const streams = new Map();` - the atlas, keyed by `offs` |
| 190–212 | the loop: `for i in 0..cap.length` → `parseSpriteList(cap.state(i).spritebuffer)` → `streams.set(s.offs, walkStream(s.offs, s.width, s.height))` |
| 235–258 | the ship's 17 `$25533A` tilt entries, harvested BY ADDRESS out of `player.tables.json` (`anim.a.shipSel0`) |
| 772 | `streams: [...streams.entries()]` → `assets/manifest.json` |

**[M] Reproduced this wave** (`tools/w35atlas.mjs capture`, over
`rip/web/capture.{json,bin}`): 161 frames, **7,671 display-list records, 150
DISTINCT `offs` VALUES**. The ship harvest adds **16** (the tilt-0 image
`$001520` is already among the 150). **150 + 16 = 166**, the number in
`assets/manifest.json` `spr.streams`.

So the provenance is exactly as the brief states: **the atlas is the set of
sprite addresses that appeared in a 161-frame recording of `fly-around`**, plus
one by-address harvest that W12 had to add precisely because the recording could
not supply it.

## 2. WHAT IN THE ROM DECIDES WHICH STREAMS EXIST - THERE IS NO STAGE LIST

**[M] There is no per-stage sprite table, and no build-time list.** The sprite
address is a per-object DESCRIPTOR FIELD: the display-list record's hardware
words 2–3, which every enqueue stub reads from the object record at **`(A6+$A)`**
(`src/spritequeue.js` §the seven-field spec). `offs` = bits 22..0 of that
longword; bit 23 is the priority bit.

Four kinds of writer put a value there, all of them ROM data or ROM immediates:

1. **Prototype tables** copied at spawn by `$2637A2` (`src/enemyproto.js`) - the
   third longword of each `$20`-byte sub-record prototype IS `(A6+$A)`.
2. **Direction-indexed longword tables** - `move.l (A0,D1.w),($a,A6)` with
   `D1 = (heading & $3E) << 1`, i.e. **16 longwords**. e.g. `$269E48`
   (`src/initbody.js:149`), `$268B9E` and `$268C9E` (`src/handlers.js:151-152`),
   `$272E7A` (`src/initbody.js:608`).
3. **Immediates inside handler / bullet-behaviour bodies** - e.g.
   `$275A76 move.l #$192A48,D2` (`src/handlers.js:891`), and W28 §3 counted
   **29** such literals inside `src/mover.js` alone.
4. **Arithmetic on a base** - `$2767B2 eori.l #$B4,($A,A6)` toggles a sprite
   pointer between two images (`src/handlers.js:1299`), and the bullet bodies
   step a base by a fixed stride.

## 3. THE FINDING THAT CHANGES THE PRICE: **THE MASK ROM IS A SELF-DESCRIBING DIRECTORY**

`PLAN-no-recordings.md` §6 risk 2 says *"sprites CANNOT be statically enumerated
(harvest-only, wave 3), so the sprite atlas grows with the corpus"*. **[M] That
is false, and here is the construction that falsifies it.**

Every sprite stream in `cave_b04401w064.u1` is laid out as

```
  word 0..1   the COLOUR POINTER (a 32-bit LE value; colStart = value >> 2)
  word 2..    wide*high MASK words
  + 2 words   trailer/pad          -->  STRIDE = wide*high + 4, always
```

and the colour pointers are **monotone across the whole ROM**. So the stream at
`o` is followed by the stream at `o + L` where `L` is the unique length
satisfying

```
  hdr(o + L) - hdr(o) == ceil(clearBits(mask[o+2 .. o+L-2]) / 3)
```

- the colour words the drawer consumes for that stream (one 5-bit pixel per
CLEAR mask bit, three pixels to a colour word: `export-web.mjs walkStream`).
That is a closed chain, and walking it from `$000000`:

> **[M] M = 8,073 SPRITE STREAMS, occupying `$000000..$33A6E4` of the
> 4,194,304-word mask ROM; the remainder is zero-filled.** The walk consumed the
> region with **one** unique solution at every step (no ambiguity within a
> 8,192-word search) and terminated on the end-of-colour sentinel at `$33A6E4`.

**The directory was validated against both instruments, and it agrees with both:**

- **[M] All 150 capture-derived streams are directory entries**, and every one's
  directory length equals `wide*height + 4` for the extents the recording's own
  display list carried. 150 of 150, 0 mismatches.
- **[M] All 329 port-emitted streams (§4) are directory entries**, same extent
  check, 0 mismatches.

The only row that is not a picture is `$000000`, drawn 1x1 by the recording - a
null/placeholder pointer.

## 4. THE ROM-DERIVED SET vs THE RECORDING-DERIVED SET

`tools/w35atlas.mjs diff` runs the PORT for 12,000 logic frames from
`fly-around`'s lf2000 seed and collects every `offs` its own emitter writes to
`$800000..$8009FF`, parsed by the same `parseSpriteList` the capture side uses.
**Not one of those values comes from `capture.bin`** - they come from the
prototype tables, the direction tables and the immediates of §2.

INTERVENTIONS, named (`docs/knowledge/09`): single-frame Button-1 tap every 4
logic frames, the owner's stick script (DOWN + a 512-frame left/right sweep),
`--no-pods` (the option object counted and not run - it throws at `$24C164` on a
raw held Button 1), `--stub-unported` (the 8 unported stage-1 handlers count
their dispatch and free the enemy, as the cartridge's own dummy `$26781C`
does), and a free run past the end of the 2,200-frame trace. Nothing is compared
against MAME.

```
  CAPTURE      161 frames, 7,671 records          150 distinct streams
  PORT      12,000 frames, maxclk 836, no throw   329 distinct streams
  BOTH                                             53
  CAPTURE-ONLY                                     97
  PORT-ONLY                                       276
```

**They agree on 53 streams. The union is 426, and neither instrument is a
subset of the other.** That is the finding, and it is stated as two sets rather
than a percentage for exactly that reason.

### 4.1 WHAT THE 97 CAPTURE-ONLY STREAMS ARE

Every one was located by searching build B for its longword. Grouped by the ROM
table or immediate it comes from:

| source | streams | what |
|---|---|---|
| table `$24BBBA` | 64 | the OPTION pods' images and their shadows - **the port run had `--no-pods`**, so this is an artefact of the intervention, not a gap |
| table `$269E48` | 10 | the damage-first family's 16-heading table (types `$05/$07/$08/$09/$0B`) |
| table `$268594` | 6 | enemy type `$10` |
| **no literal anywhere** | 6 | `$1C07A4` and `$1C0D30/44/58/6C/80` - see §4.3 |
| table `$269BB6` | 4 | the damage-first family, second table |
| table `$268B9E` | 2 | type `$11`'s fire sprites at two headings the port never took |
| immediates | 3 | `$1C03C8` (`$283D50`), `$1C0D1C` (`$28298E`), `$1CF060` (`$284F88`) |
| table `$2881D2`/`$2881F2` | 2 | the HUD/effect block |

### 4.2 WHAT THE 276 PORT-ONLY STREAMS ARE

| source | streams | what |
|---|---|---|
| table `$268B9E` | 54 | type `$11` at headings the recording never showed |
| table `$272C7A` | 49 | types `$20/$21` (handler `$272AAC`) |
| tables `$26BE70`/`$26BF42`/`$26BFE8` | 77 | **the MIDBOSS** - the recording ends before it appears |
| tables `$25572E`/`$255342`/`$255462` | 64 | the ship's other tilts and the pods' other images |
| table `$24D8AC` | 9 | the option object's second bank |
| table `$278338` | 4 | |
| immediates | 19 | incl. 12 background-element streams at `$22CBCC..$233F34` (`$2623A6..$262760`) |

### 4.3 THE SIX WITH NO LITERAL - and they are NOT a hole

`$1C0D30 $1C0D44 $1C0D58 $1C0D6C $1C0D80` are frames 2..6 of a bullet
animation whose **base, step and wrap are three immediates in one routine**:

```
$28298E  move.l #$1C0D1C,($a,A5)        the base
$2829AE  addi.l #$14,-(A1)              the step
$2829B4  cmpi.l #$1C0D94,(A1) / bne     the wrap
$2829BC  move.l #$1C0D1C,(A1)
```

(`src/mover.js:683-688`, `animateRenderOffsWrap`). So they are statically
enumerable *exactly* - base, step, wrap - and a literal scan alone would have
called them absent. **That is the one place in this analysis where a scan and
the listing disagree, and the listing wins.** `$1C07A4` is the same shape from
the other direction: one 2x24 stream past `$1C0770`, which IS a literal in the
`$283D50` direction table.

## 4.4 A THIRD INSTRUMENT, AND IT SAYS THE SAME THING ABOUT THE DIRECTORY

`games/ddpdoj/rip/assets/manifest.json` - wave 3's sprite atlas, harvested from
`stage1-deep.tsv` + `stage1-open.tsv` - holds **1,211 distinct streams**.

> **[M] All 1,211 are directory entries.** 1,163 of them draw their stream's
> full length exactly; 48 draw a prefix; **0 read more than the ROM chain
> gives**, which is the only direction that would ship a short sheet.

So across three independent instruments - 150 + 329 + 1,211 = **1,690
observations** - the chain has zero exceptions.

**And that manifest states the claim this wave falsifies, in its own words:**

> `"policy": "HARVESTED FROM THE RUNNING GAME, not statically walked."`
> `"policy_why": "There is no sprite table in ROM. … the stream cannot be`
> `random-accessed and a header cannot be told from two arbitrary bytes.`
> `Walking the mask ROM would be a GUESS."`

Half of that is right and half is not, and the halves matter separately.
**There is indeed no sprite table in ROM** - §2 confirms it from the other side.
**But a header CAN be told from two arbitrary words**, because it is not an
isolated value: it has to equal the previous stream's colour pointer plus the
colour words that stream's own mask bits consume. Walking the mask ROM is not a
guess; it is an equation with one solution. `PLAN-no-recordings.md` §6 risk 2
inherited the wrong half and should be corrected with this wave.

## 5. THE ROM-DERIVED ENUMERATION, AND ITS HONEST BOUND

`node games/ddpdoj/tools/w35atlas.mjs rom` (committed) reads the decrypted 68000
image and the mask ROM and prints:

```
DIRECTORY 8073 streams in the mask ROM, $000000..$33a6e4 of $800000 words
  ...52 tables, 2,246 entries...
ROM LIST 2035 distinct stage-1 sprite streams, from 52 tables (2246 entries)
         + 22 immediates + 15 animation ranges
```

| | streams |
|---|---|
| **M - the cartridge's whole inventory**, walked from the mask ROM | **8,073** |
| build-B literal scan (every longword that is a directory start) | 5,915 |
| **the committed stage-1 list** (52 tables + 22 immediates + 15 anim ranges) | **2,035** |
| wave 3's harvest, 2 scenarios | 1,211 |
| the port's own emitter, 12,000 frames | 329 |
| **the published atlas today** | **166** |
| `capture.bin`'s own display lists | 150 |

**[M] The committed list covers 149 of 149 capture streams, 328 of 328 port
streams, and 848 of 1,182 wave-3 harvest streams**, and contains **1,058 streams
no instrument has ever reached** - which is the whole argument for enumerating
statically. Those 1,058 are what a recording-derived atlas is missing and cannot
know it is missing.

**THE BOUND, stated plainly, three ways.**

1. The *set* of tables was found by asking where in build B each OBSERVED
   stream's longword lives. That half is discovery by measurement and is a
   **FLOOR**. Each table is then enumerated to its FULL EXTENT from the ROM, and
   that half is the enumeration.
2. **334 of wave 3's harvested streams are still outside the committed list.**
   They are isolated longword immediates; naming each needs a citation, and I did
   not write 334 citations. They are enumerable by the same scan.
3. The literal scan's own false-positive floor is measured, not assumed: running
   the same scan against a DECOY directory (every start shifted by `$4`, `$8`,
   `$100`, `$1000`) scores **624–1,273** hits where the true directory scores
   **8,598**. The signal is 7–14x the decoy, so the bulk of the 5,915 is real -
   but "the bulk" is not "all", and no number here treats a literal hit as proof
   on its own.

## 6. WHAT WAS PORTED

**`src/render/spritedir.js` (NEW)** - the chain solver, `streamStride`,
`streamExtent`, `walkDirectory`, `colourBase`. Export-time only; nothing under
`src/web/` imports it.

**`tools/export-web.mjs`** - a stream's extents no longer come from the
recording's display-list record. `walkStream(offs, wide, high)` is gone;
`streamExtent(sprmask, COLW, offs)` replaces it, and the record's reading is
kept ONLY as a cross-check:

- `checkAgainstRecord` throws if any record would read MORE mask words than the
  ROM chain gives that stream (the direction that ships a SHORT sheet).
- the ship harvest no longer *uses* `SHIP_SIZE = $0620`; it **asserts** it -
  all 17 tilt streams must be exactly `3 x 32` by the chain.
- the exporter prints the split: **7,601 of 7,671 records match their stream's
  full length exactly; 70 read a prefix**, and all 70 are the null stream
  `$000000` (the recording draws it 1x1; the ROM stream is 8 mask words).

**[M] The bundle is unchanged except by 14 bytes.** Only `$000000`'s extent
moved (maskWords 3 → 10); `maskUsed` 12,893 → 12,900, `colUsed` 24,794 →
24,794, all 165 other streams byte-identical. `tools/webgate.mjs`: 14 files,
one frame, 98.8 % non-black - unchanged.

**`tools/w35atlas.mjs` (NEW)** - `capture` / `port` / `diff` / `rom`.

### 6.1 EVERY CHECK WAS SEEN TO FAIL

`games/ddpdoj/tests/spritedir.test.js`, 9 tests. Mutations applied byte-exactly
in Python with a single-occurrence anchor assertion, the file restored and
sha256-verified identical after every one (`src/render/spritedir.js`
`e7147dd9b44971ec`, both ways, 8 times).

| # | mutation | result |
|---|---|---|
| M1 | `maskWords` ships the 2-word trailer too | RED - 1 |
| M2 | colour rounding `floor(npix/3)` instead of `ceil` | RED - 2 |
| **M3** | the chain is searched every 2 words, not 4 | **GREEN, then RED - 1** |
| M4 | the trailer's clear bits are counted | RED - 9 |
| M5 | the header is not shifted right by 2 | RED - 9 |
| M6 | `streamStride` returns 4 instead of throwing | RED - 3 |
| M7 | the chain returns a stride 4 words SHORT | RED - `export-web.mjs` exit 1, "a display-list record reads N mask words but the ROM chain gives this stream only M" |
| M8 | the chain returns a stride 4 words LONG | RED - `export-web.mjs` exit 1, "ship tilt stream: the ROM chain says N, the MEASURED `($e,A6)` = `$0620` says 3 x 32" |

**8 mutations, 8 RED. ONE SURVIVED THE FIRST PASS AND IT WAS A DEFECTIVE CHECK
OF MINE, not an uncatchable one** - the distinction W31 asked later waves to
keep. M3 survived because every stream in the synthetic region had an even mask
count, so a 2-word grid found the same answer. The fix is a test that builds the
ambiguity on purpose: stream 0's first six mask words consume 18 colour words,
so a trailer holding base + 18 makes `L = 10` a false solution that only the
4-word grid steps over (`THE SEARCH GRID IS 4 WORDS, AND IT HAS TO BE`).

M7 and M8 are how the two exporter guards were seen to fail; neither has a unit
test, because both are assertions about the cartridge and the exporter is the
only thing that reads it.

### 6.2 THE FULL GATE

`python games/ddpdoj/tools/oracle/pgm.py check`, run to completion:

```
VERDICT: ALL GREEN -- 49 passed, 0 failed, 0 SKIPPED
# pass 525   # fail 0   # skipped 0
```

Unchanged from W32/W33/W34's 49/0/0; the unit-test stage is 516 → **525**
(the 9 new `spritedir` tests) with **no skip**, which is the state W34 §6.2's
exporter fix produced and this wave did not disturb. **Nothing was disabled,
skipped, narrowed or loosened**; no compared column set, window or frame count
moved, and no stage was added. `tools/webgate.mjs` still fetches 14 files and
renders a frame 98.8 % non-black off the rebuilt bundle.

### 6.3 A HAZARD THIS WAVE WALKED INTO, RECORDED SO THE NEXT ONE DOES NOT

`tools/w35atlas.mjs diff` was re-run **while `pgm.py check` was running**, and
came back `2,068 frames, maxclk 237, BLOCKED at $249814` instead of
`12,000 frames, maxclk 836, no throw`. Nothing in the port had changed: the gate
re-records `tools/oracle/out/w4/fly-around.tsv` and the tool was reading it
mid-write. That is `HANDOVER.md` §10's "shared output paths" hazard, and the
symptom was a *plausible* number rather than an error. Every §4 figure in this
document was re-derived on the settled tree after the gate finished, and
reproduces exactly: 150 / 329 / 53 / 97 / 276.

## 7. WHAT IS NOT PORTED, AND EXACTLY WHAT IT WOULD TAKE

The atlas's *addresses* are still the recording's. Two things block replacing
them, and only one of them is about sprites.

### 7.1 THE COST IS MEASURED, AND IT NEEDS LAZY LOADING

Exporting the ROM list instead of the 166:

| | streams | mask gz | colour gz | total gz |
|---|---|---|---|---|
| today (recording-derived) | 166 | 5,708 B | 34,566 B | **39.3 KiB** |
| the committed ROM list | 2,035 | 67,150 B | 1,154,096 B | **1,192.6 KiB** |

That is **+1.13 MiB before the first frame**, against a bundle whose current
boot cost is 467.9 KiB. The owner's standing constraint is "boot must not get slower
than it is today", and the approval for sharding covers the BACKGROUND. So this
is not a drop-in: the sprite sheet needs the same deferred-shard treatment
`gfx/bg.shard*` already has (`src/web/assets.js`), keyed by something other than
scroll position - most plausibly by source table, since a table is one object
type's whole image set. **That is a wave, and it is a wave about loading, not
about sprites.**

### 7.2 A COMPLETE STAGE-1 STATIC ENUMERATION IS BLOCKED ON UNPORTED CODE

1,150 is a floor because the table SET came from two instruments. To make it a
census, every stage-1 producer's `($a,A6)` writers have to be read out of the
listing, and the ones nobody has read are:

- **the 8 unported stage-1 handlers** - `$27733E $275F30 $26A5E4 $26AD28
  $26A860 $29700C $2697F6 $292902` (W34 §4.2: all 8 are dispatched today, all 8
  are loud named throws), 2,063 instructions;
- **the effect pool** - `$289004` (34 kinds, 80 slots, 294 call sites) and its
  driver `$288E4E`, which W34 §1.6 deliberately left together. Every explosion's
  images are behind it;
- **the boss `$292902`** - 10 instructions of dispatch over a script format
  nobody has read;
- **the option object's laser arm `$24C180`**, which is where `$24BBBA`'s and
  `$24D8AC`'s remaining entries are indexed from.

Until those are read, any static list is a floor with a known name for every
piece missing from it - which is a better state than a recording-derived list,
because a recording-derived list has no such names.

### 7.3 WHAT I COULD NOT DETERMINE

- **Whether every stream in the ROM list is REACHABLE in stage 1.** The tables
  are enumerated whole, and a table like `$272C7A` (224 entries) plainly serves
  more than one stage. Over-inclusion is safe for an atlas and wrong for a
  coverage claim, and this worklog does not make one.
- **Whether the 4-word search grid is a property of the ROM or of its builder.**
  All 8,073 strides are `0 mod 4` and the whole ROM walks closed on that grid;
  the test `THE SEARCH GRID IS 4 WORDS` shows a decoy that a 2-word grid would
  take, so the grid is load-bearing. I have no listing evidence for WHY the
  builder aligned them.
- **Anything about the board.** No MAME was run for any number in §1–§6; the
  port figures are the port replayed against a TSV already on disk, and the
  capture figures are the recording read off disk.

## 8. WHERE THE WAVE ENDED

**A. THE BRIEF'S PREMISE HELD, AND ITS PESSIMISM DID NOT.** The 166 streams are
exactly what the brief said: 150 walked out of `capture.bin`'s own display lists
plus 16 ship frames harvested by address. But the standing claim behind that -
wave 3's *"walking the mask ROM would be a GUESS"*, carried into
`PLAN-no-recordings.md` §6 risk 2 as *"sprites CANNOT be statically
enumerated"* - is false, and §3 is the construction.

**B. THE CARTRIDGE'S OWN INVENTORY IS 8,073 STREAMS**, walked from
`$000000..$33A6E4` with one unique solution at every step, validated against
1,690 observations from three instruments with 0 exceptions.

**C. ROM-DERIVED AND RECORDING-DERIVED DISAGREE IN BOTH DIRECTIONS.** 53 in
both, 97 only in the recording, 276 only in the port. Every one is attributed to
the ROM table or immediate it comes from.

**D. THE EXTENTS ARE NOW THE CARTRIDGE'S**, and the recording's records are kept
only as a cross-check that can fail two named ways (M7, M8).

**E. THE ADDRESSES ARE NOT, AND THE REASON IS A MEASURED SIZE, NOT AN UNKNOWN.**
+1.13 MiB gzipped at boot. That is a loading wave, and it needs the owner's
sharding decision extended to sprites.

### RANKED, FOR THE REVIEWER

1. **§3.** If the chain solver is wrong, everything downstream of it is. It is
   one equation; attack the equation, not the counts.
2. **§5's three-way bound.** 2,035 is a FLOOR whose table SET came from
   measurement. If a reviewer thinks the floor is being read as a census
   anywhere in this document, that is the defect.
3. **§4.3.** Six streams have no literal anywhere in build B and a scan alone
   would have called them absent. Measurement proves presence; only the listing
   proves absence - arriving from the direction where the *scan* is the
   measurement.
4. **§6.1's survivor.** M3 passed because the fixture had no ambiguity in it,
   which is the same shape as W34's M3/M7/M13.
5. **§7.2.** The four named blockers on a complete static enumeration. If any of
   them is not actually a blocker, the list can grow this wave rather than next.

## LOG (appended as findings arrive)

- opened.
- §1 [M]: the 166 = 150 `offs` values walked out of `capture.bin`'s own 161
  display lists + 16 ship tilt frames harvested by address. Reproduced.
- §2 [M]: there is NO per-stage sprite list in the ROM. The address is a
  per-object descriptor at `(A6+$A)`, written from prototype tables,
  16-entry direction tables, immediates, and arithmetic on a base.
- §3 [M]: **the mask ROM is a self-describing chain** - stride = `w*h + 4`, and
  the colour pointer in each stream's own header closes the chain. Walked:
  **8,073 streams**, `$000000..$33A6E4`. Validated by 150/150 capture streams
  and 329/329 port streams landing exactly on entries with exactly the right
  extents. `PLAN-no-recordings.md` §6's "sprites CANNOT be statically
  enumerated" is FALSE.
- §4 [M]: port 329 streams vs capture 150; **53 in both, 97 capture-only, 276
  port-only.** Union 426. Every capture-only and port-only stream is attributed
  to the ROM table or immediate it comes from (§4.1/§4.2), and the six with no
  literal anywhere are a bullet animation whose base/step/wrap are three
  immediates in one routine (§4.3).
- §4.4 [M]: a THIRD instrument - wave 3's 1,211-stream harvest - is also 1,211
  of 1,211 directory entries, 0 reading past the chain. 1,690 observations,
  0 exceptions. And its own manifest carries the claim this wave falsifies.
- §5 [M]: the committed ROM list is **2,035 stage-1 streams** (52 tables /
  2,246 entries + 22 immediates + 15 animation ranges), covering 149/149
  capture, 328/328 port, 848/1,182 harvest, with **1,058 no instrument has
  reached**. It is a FLOOR and says so three ways, including a decoy-directory
  calibration of the literal scan (624–1,273 hits vs 8,598).
- §6 PORTED: `src/render/spritedir.js`; `export-web.mjs` takes stream extents
  from the ROM chain and keeps the recording's records only as a cross-check
  (7,601 of 7,671 exact, 70 prefix - all 70 the null stream). Bundle moved by
  **14 bytes**, webgate unchanged.
- §7 NOT PORTED, with the cost measured: shipping the ROM list is **+1.13 MiB
  gzipped at boot**, which needs sprite sharding; and a COMPLETE stage-1
  enumeration is blocked on the 8 unported handlers, the effect pool
  `$289004`+`$288E4E`, the boss `$292902`, and the laser arm `$24C180`.
- `PLAN-no-recordings.md` §6 risk 2 corrected in place.
- §6.2: `pgm.py check` **ALL GREEN 49/0/0**, unit tests **525/0/0**, no skip.
- §6.3: a diff run raced a concurrent `pgm.py check` rewriting
  `out/w4/fly-around.tsv` and produced a PLAUSIBLE wrong number. Re-derived on
  the settled tree.

status: DONE
