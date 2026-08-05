# 66 — IMPL E6: THE BOMB'S ART AND THE LASER BOMB'S

status: **IN PROGRESS**

started: 2026-08-05
wave: 66. role: IMPLEMENTER (sole writer to `games/ddpdoj/`).
`games/gradius/` NOT TOUCHED.

target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address is build B
(`$23xxxx..$2Axxxx`) unless a line says otherwise.

brief: **the owner can bomb but cannot see it.** W64 shipped the bomb (174
bucket-13 records over three bombs, no sprite shard) and W65 the laser bomb
(three named missing sprite streams). Harvest and ship the art for both.

`[M]` = measured by me, this session, on this tree.

inputs read in full: `64-impl-B2-bomb.md`, `65-impl-B3-bomb-beam.md`,
`58-impl-E3-art.md`, `47-impl-E2-art.md`, `HANDOVER.md`,
`docs/knowledge/09`, `docs/knowledge/10`.

---

## 1. THE BRIEF'S PREMISE, CHECKED — it holds, and it is SMALLER THAN THE HOLE

The brief says the bomb has **174 bucket-13 records and no sprite shard** and
the laser bomb has **three named missing sprite streams**. Both reproduce, and
both are a floor.

| the brief / W64 / W65 says | `[M]` this session |
|---|---|
| W64 §8.3: 174 bucket-13 records over three bombs, no shard | **CONFIRMED TO THE RECORD.** [M] 174, over **16** distinct streams |
| W65 §7.3: "three named missing sprite streams" `$042924 $040CC8 $040EAC` | **THREE IS THE PAGE'S TOP-3 LINE, NOT THE COUNT.** [M] a laser bomb asks for **48** distinct bucket-13 streams, and 27 more outside bucket 13 — **75 in all** |
| W65 §1: the driver runs 1 + 41 + 3 = 45 records | HOLDS, and the art is not one set: [M] the ordinary bomb's 16 streams are all `$02xxxx`/`$03xxxx` and the laser bomb's are all `$04xxxx`. **They share a bucket and NOTHING else** |
| E3 §7.1: the beam's blocks for `$24BB0A` entries 7..19 sit in the unexported hole `$24B900..$24BB0A` | **NOT MINE.** §4 — none of this wave's art is in or behind that hole, and the window it needs is not one this wave has any reason to move. The throw stays |

### 1.1 THE CONTROL THAT MAKES THE COUNT MEAN SOMETHING

Four runs, 2,600 frames each, the shipped seed, the page's own
`portSpriteList` and the page's own map, `$810424` pinned `$FF` the way
`src/web/app.js:699` pins it:

```
[M] E3's own input (fly UP, tap, two 120-frame HOLDS per 600)   0 missing
[M] fire HELD, NO bomb                                          0 missing
[M] fire HELD, THREE LASER BOMBS                               75 missing
[M] fire TAPPED, THREE ORDINARY BOMBS                          18 missing
[M] fire TAPPED, no bomb                                        7 missing
```

**Held fire with no bomb is 100.0 % on every bucket, so every one of the 75 is
the LASER BOMB's** — the control is the same input with Button 2 never pressed,
which is the only way to separate "the bomb has no art" from "this input has no
art". The tapped-no-bomb row is 7 and they are **not the bomb's** (§3.3).

## 2. WHAT THE BOMB ACTUALLY ASKS FOR — six producers, not one

`[M]` every one derived from the cartridge (`.scratch/e6derive.mjs`) and then
checked against the measurement, never the other way round:

| | producer | how it is CLOSED | streams | gz |
|---|---|---|---:|---:|
| (a) | **THE ORDINARY BOMB** — the three scripts the three templates' own `($1E,A6)` longs name: `$256558` (4 x 12-byte entries to `$FFFF`), `$2565DE` (8 longs, `$1C`..0 step 4), `$25663A` (4 longs to `$FFFFFFFF`) | each script's own TERMINATOR | **16** | 119.9 KiB |
| (b) | **THE LASER BOMB** — `$256662..$256986`, W65's own derived data block, scanned for mask-ROM DIRECTORY entries (E3 §2.1(b)'s mechanism) | the block's far end is `$256986`, the bit-1 twin's first script, i.e. the code this port throws on | **168** | 58.1 KiB |
| (c) | **POOL E's OTHER TEMPLATES** `$28A464..$28A506` — W65's own window, the sparks `$289FF4` allocates | the window W65 derived and asserts on export | **24** | 1.2 KiB |
| (d) | **THE SHIP'S BIT-7 AURA** `$2556BA..$2556E2` — two pointers x four frames | `$25567A + 16*4 == $2556BA` from below and `glowSprite $2556E2` from above | **8** | 5.7 KiB |
| (e) | **ENEMY TYPE `$8A`** — `$1BCA34` (the sub-proto `$2766E6`'s `($A)` long) and `$1BCA80` (`$2767B2 eori.l #$B4`) | the `eori` immediate IS the second address | **2** | 0.5 KiB |
| (f) | the family that begins where W58's `$12C7B0` chain ENDS — **not the bomb's**, §3.3 | stride 68 x 8, and `$12D650` is stride 1084 | **8** | 1.6 KiB |
| | | | **226** | **187.6 KiB** |

**[M] ALL 91 DISTINCT MEASURED MISSING STREAMS ARE INSIDE THE DERIVED SET, and
the set is 226.** The derivation is 2.5x the measurement, which is the whole
point of `docs/knowledge/09`: a harvest sized off one run's misses is the
tank-hull mistake.

## 3. THREE THINGS NO DOCUMENT IN THIS REPO HAD

### 3.1 **THE BOMB TURNS ON AN ENEMY'S ANIMATION** — `$276756 tst.w $811F72`

`[M]` `$1BCA34` and `$1BCA80` appear in buckets 0 and 3 on the exact frame
Button 2 is pressed, and their first frame MOVES when the press moves. They are
not bomb art: they are enemy type `$8A`, the scroll-locked ground gun
(`src/handlers.js handler8A`, ported since W36).

**`$276756 tst.w $811F72 / bne $2767A6` skips the proximity test while the
bomb's record is live**, so the gun falls straight into `$2767AA bchg #$6` and
`$2767B2 eori.l #$B4,($A,A6)` — it BLINKS between two frames `$B4` apart and
emits, on every other frame, for as long as the bomb is up. `[M]` with the
identical input and no press the same gun spawns on the same two frames
(logic 2,713 and 2,777), writes `$1BCA34` **twice**, and never draws; with a
press it writes 102 times.

That is W64 §1.2's *"one instruction turns on every gate in this port that reads
`$811F72`"* arriving in the ART, and it is a seventh subsystem on top of the
seven that finding lists.

### 3.2 THE LASER BOMB'S ART IS NOT THE ORDINARY BOMB'S

`[M]` zero overlap. 16 streams against 168, in disjoint address ranges. W65 §7.3
naming three addresses off the page's top-3 line is what made this look like a
small hole; it is the largest single art gap left in this port.

### 3.3 A FAMILY W58's OWN NOTE POINTED AT AND DID NOT SHIP

`[M]` fire TAPPED and never held, no bomb: seven missing streams,
`$12D474..$12D60C`. E3 §2.2 closed `$12C7B0..$12D430` and wrote that `$12D430`
"is stride 68", i.e. the first frame of the next family — and stopped there.
`[M]` that family is **eight frames of stride 68 ending at `$12D650`**, which is
stride 1084. It is not the bomb's and it is shipped here anyway, because a
"zero missing streams" claim that only holds when the player holds fire is not
the claim this wave is asked for.

## LOG (appended as findings arrive)

- opened.
- §1 [M]: the premise holds and is a FLOOR. 174 bucket-13 records over **16**
  distinct streams; the laser bomb's "three" is **75**.
- §1.1 [M]: **held fire with NO bomb is 100.0 % and 0 missing**, so all 75 are
  the laser bomb's. The control is what makes that a measurement.
- §2 [M]: **226 streams derived from the cartridge, 187.6 KiB gz, and all 91
  measured misses are inside it.**
- §3.1 [M]: **`$276756 tst.w $811F72` makes enemy type `$8A` animate while a
  bomb is up** -- 2 writes without a press, 102 with one.
- §3.3 [M]: E3 §2.2's own "next family" is 8 frames of stride 68 ending at
  `$12D650`.
