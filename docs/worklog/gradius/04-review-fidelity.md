# Wave 4 review: flow structure ($1B ladder, stage intro, pause) — fidelity lens
status: DONE
wave: 4   role: review   started: 2026-07-31

## The task, as I understood it

Read commit `1c699fe` **by content**, not by its report. Verify the new code
against the cartridge's bytes; hunt the fall-through trap; confirm no existing
behaviour moved; break at least two new checks and see them red; find anything
silently unported that reads as finished. READER — no edits to `src/` survive
this run, no commits.

## What I MEASURED

### 0. The gate, run by me, twice

```
node --test games/gradius/tests/
  # tests 157  # pass 157  # fail 0  # skipped 0  # todo 0

node games/gradius/tools/test-all.mjs
  21 scenarios, 5726 of 6569 frames compared (6 truncated: right-wall@493,
  diag-rd-lu@533, diag-ru-ld@445, lr-both@482, speed6-right@515,
  speed3-diag@529), 0 failures, 0 clamps uncovered, 0 stale annotations,
  6 fields SKIPPED (pad2 oamBudget spriteOverflow scanline cpuCycle splitSpins)
  PASS intro-boot 357 / intro-respawn 85 / pause 239, all TIER 1 exact
  GREEN -- 6 passed, 0 failed, 0 SKIPPED
```

The six SKIPPED are FIELD-level, each with a printed reason ("no port
counterpart"), and are the pre-wave-3 set minus three. No STAGE skipped.

Existing behaviour: the 18 pre-existing scenarios compare **5045** frames
(5726 − 681), which is exactly the wave-3 number recorded independently in
`03-impl-*.md`, `03-qa-adversarial.md` and `03-review-fidelity.md`. I re-added
the per-scenario counts from my own run: 1465+599+239+239+92+239+239+239+132+
44+239+239+81+239+114+128+239+239 = **5045**. Nothing moved.

### 1. The oracle side is the real cartridge, and it reproduces

The strongest thing a reviewer can do here is not trust the recorded artifact.
I re-recorded two of the three new scenarios from the ROM:

```
python games/gradius/tools/oracle/scen.py --only intro-boot pause
  intro-boot   640 frames  lag=1 [283]  slotsVisited 32..32
  pause        640 frames  lag=1 [283]  slotsVisited 32..32

sha1  intro-boot.json before  9c8fe634f25e9e808291d80973c1f1c53c955a12
sha1  intro-boot.json after   9c8fe634f25e9e808291d80973c1f1c53c955a12
```

Byte-identical, and `lag = 1 at game frame 283` is confirmed from my own run —
the `$882C` frame drop is real and is where the commit says it is.

### 2. `intro-boot` is NOT vacuous — the ship's position is computed

`docs/knowledge/03` shape 2 is "the harness sets up state the application never
has". Checked directly, out of the recorded `seedRam` at align 282:

```
$0360 = 0   $0320 = 0   $0100 = 0   $3F = 0   $55 = 0   $57 = 0   $35 = 0
$0D = 15    $0E = 1     $19 = 0     $24 = 0
rows: f282 x=0 y=0 $1B=0 | f283 x=80 y=96 $1B=1 | f309 $1B=128
```

So the port has to COMPUTE `$9BD4[$9BCC[$19] + ($3F>>1)]` -> (80, 96) on the
first compared frame. That check has teeth.

### 3. ROM spot-checks — read out of `Gradius (USA).nes` at
`file offset = 16 + (addr - $8000)`, not out of any doc

Every one of these matched the port's cited listing:

| address | bytes | verdict |
|---|---|---|
| `$965C-$9662` | `A5 15 F0 03 4C 8C 9A` | pause jump to `$9A8C` ✔ |
| `$9663-$9667` | `A5 19 C9 04 D0 3C` | stage-5 census gate ✔ |
| `$96A5-$96C4` | `A9 10/25 1B/D0 24 … A5 1B/10 03/4C 2A 98 / A2 03/86 0D/20 E4 83` | the ladder, in that order ✔ |
| `$96C5` table | `3E 9B ED 9B 12 9C 1E 9C 24 9C` | five entries ✔ |
| `$96E6/$96E9` | `20 F0 9B` / `20 3C 9C` | `$96CF` really does call `$9BF0` and `$9C3C` ✔ |
| `$96EF` | `A5 4C D0 03 4C 9D 97 C6 4C 4C 5E 9A` | test-then-DEC, `JMP $9A5E` ✔ |
| `$982F` entry 0 | `4D 9A` | `st_9A4D` ✔ |
| `$9A3D/$9A45` | `0C 0C 0C 0C 0B 0B 0C 02` / `81 x8` | `bossPage` = `$0C` ✔ |
| `$8346[0]` | `00` | `$8357`'s only non-sound effect leaves `$2D` = 0 ✔ |
| `$9B3E-$9BC9` | full listing | matches the port instruction for instruction ✔ |
| `$9BCC` | `00 05 0A 00 00 0F 14 00` | 8 base indices ✔ |
| `$9BD4-$9BEC` | `65 65 65 65 65 65 65 66 66 66 65 65 75 75 75 65 65 65 A3 A5 65 65 65 65 73` | 25 bytes, `$9BED` is `20 AB 83` ✔ |
| `$9C12/$9C1E/$9C24/$9C3C` | as listed | ✔, incl. the `4C 8E 9D` tail call and the `$9C38 -> $9C3C` fall-through |
| `$9AD1-$9B3D` | full listing | ✔ incl. `$9B27 85 B2` with A = 0 |
| `$9765-$9784` + `$9785` | `89 97 93 97`, `$9793` = `08 08 04 04 02 01 02 01 40 80` | the Konami code ✔ |
| `$882C-$886E`, `$81B5`, `$8333`, `$83B0`, `$83AB` | as listed | ✔ ($8333 is `JSR $83B0` FIRST, then the two register zeros — the port's comment has that order reversed, harmless) |
| `$9D83/$9D8E` | `$9D90 STA $57`, threshold `$0180` at `$9DA3-$9DAD` | ✔ |
| `$8B08` | `F4 F4 F4 F4 CE 6D 23 F8` | `$F4 AND $E3 = $E0 = 224` ✔ |
| `$83E4` | pulls its own return, `Y = (A*2)+1` | so every handler's RTS returns to `$80AD` ✔ |

`src/render/ppu.js` uses attribute bits 0-1 (`attr & 3`), 5 (`>> 5 & 1`), 6 and
7 only, so `& $E3` provably cannot change the picture. Claim checked, not
quoted.

### 4. THE ONE REAL FIDELITY DEFECT: `$9BF0` falls through into `sub_9C09`

`src/flow.js` `introPackets()` lists the routine as ending at `9C07 E6 1B`.
It does not. From the ROM, and from `rip/prg.asm`:

```
    9C07: E6 1B      INC $1B
sub_9C09:                          <- a NAMED subroutine with its own xrefs
    9C09: A9 00      LDA #$00
    9C0B: 85 57      STA $57
    9C0D: A9 3F      LDA #$3F
    9C0F: 85 5E      STA $5E
    9C11: 60         RTS
  xrefs into it:  97EB JSR $9C09     (inside $979D, the wave-5 respawn)
                  980B JMP $9C09
```

Neither store is ported and neither is named as a gap. This is
`docs/knowledge/02` trap 1 verbatim — a routine that looks like it returns runs
straight on into the next one.

**Impact today: none observable, and I checked why rather than assuming.**
`$57` is provably 0 whenever the port reaches state 1: `$9B3E`'s `$3D-$97`
clear zeroes it in state 0, and intro states 1-3 never call `$9D8E`/`$9D83` (the
mode-5 tail is skipped entirely on an intro frame). `intro-respawn` seeds at 614
with `$57 = 0`. `$5E` has two writers (`$99B5`, `$9C0F`) and zero readers in the
whole PRG, and is not in the watch list, so nothing can see it either way.

**Impact at wave 5: real.** `$97EB JSR $9C09` is on the respawn path the next
wave has to land, and `$96E6 JSR $9BF0` (the next-stage arm) reaches it too.

### 5. The impl worklog's one wrong reading

`04-impl-*.md` "Smaller measurements worth keeping":

> `$5E` has two writers (`$99B5`, `$9C0F`) and zero readers … It changed
> 0 → 63 at f615 on the respawn run **with no `STA $5E` on that path —
> presumably an indexed store I did not chase.** Unresolved, and harmless.

It is `$9C0F STA $5E` with `A = #$3F = 63`, i.e. the very writer the same
sentence names, sitting inside the routine the port implements as
`introPackets()`. f615 is the respawn's state-1 frame. Labelled unresolved
rather than asserted, so it cost nothing — but it is resolvable in one line and
it is the same omission as finding 4.

### 6. A number that disagrees with itself inside the commit

`tools/oracle/scenarios.json`, `intro-boot.why`:

> `$0E` reads 1, 49, 37, 40, then 149 for **twenty-two** frames

Measured by me off the artifact I re-recorded:

```
$0E f286..f310 : 40 149x21 1 1 15
$57 f286..f310 : 0 …0 (f308) 1 1 1
count of 149 in the window : 21
```

**21**, on frames 287-307; f308 is the throttled frame (`$0E = 1`, `$57 -> 1`)
and f309 is the exit. The impl's own worklog says 21 and the scenario note says
22. Also `"4 x $9D8E on each of 287-308 = 88 calls"` in the same note is right,
which is what makes the 22 a typo rather than a model disagreement.

`$0D` f283..f316, from the cartridge: `6,3,3,3, 5 x23, 4,3,2,1,0, 0,0` — the
port's comment is exact.

### 7. Two checks broken, seen RED, restored byte-identical

**(a) the headline test — `counter-not-57`.** The commit says a 23-frame counter
is green on both intro scenarios and that `tests/flow.test.js` is the only thing
holding the loop shape. I built the mutation myself.

*First attempt* (21 building frames, 1 empty, exit): **the corpus caught it** —
`intro-boot w_0057@308`, `intro-respawn w_0057@639`. Worth recording: `$57` is
itself a watched byte, so a counter that also skips the throttled frame's four
`$9D8E` calls is visible.

*Faithful attempt* (four `buildBlock` calls per frame, exit when the counter
hits 23 — reproduces the measured trace exactly):

```
node --test games/gradius/tests/flow.test.js
  not ok 4 - the intro is $9C24 looping on $57, not a 23-frame counter
  # pass 16  # fail 1        <- the other 16 flow tests all PASS
node games/gradius/tools/test-all.mjs
  PASS intro-boot 357 frames  all TIER 1 fields exact
  PASS intro-respawn 85 frames  all TIER 1 fields exact
  RED -- 5 passed, 1 failed, 0 SKIPPED   (the unit stage, nothing else)
```

**Confirmed exactly as reported.** 21 oracle scenarios and 16 of the 17 flow
unit tests are blind to the exit condition; test 4 is the whole guard.

**(b) the OAM attribute mask.** Removed `& 0xE3` from `oamDma()`:

```
  FAIL  intro-boot     357 frames  s0a@283
  FAIL  intro-respawn   85 frames  s0a@616
  RED -- 5 passed, 1 failed, 0 SKIPPED
```

Red at the frame the commit says, and the respawn window catches it too.

Restored from a scratchpad backup and verified:
`sha1 src/flow.js 5ad81cdd…294249`, `sha1 src/oam.js d678892d…f9cb9a`,
`git status --porcelain` shows only untracked worklogs, `git diff --stat` empty,
`git diff --cached --name-only` empty.

## What I RULED OUT

* **A fall-through anywhere else in the ported set.** Walked every routine to
  its terminator in the ROM: `$9B3E` ends `JMP $83AB` (sound only); `$9C12` RTS
  at `$9C1D`; `$9C1E` RTS at `$9C23`; `$9C3C` RTS at `$9C44`; `$9AFA` is
  `JMP $EC1E`; `$9B3D` RTS; `$9784` RTS; `$882C` ends `JMP $81B5` -> `JMP $83B0`
  -> RTS (both modelled, in order); `$9A4D` falls into `$9A5B JSR $8357` and on
  into `$9A5E`, which the port does. Only `$9BF0` -> `sub_9C09` is missed.
* **The `$9B3E` clear being wrong at either end.** `LDX #$5A` = `$3D-$97`;
  `LDX #$7F` = 128 bytes per array. Cross-checked every zero-page address the
  port models (grep of `src/state.js`) against `clearZeroPage()`: all of
  `$3D $3E $3F $40 $41 $42 $44 $45 $46 $47 $48 $49 $4A $4B $4C $54 $55 $57 $58
  $5B $5C $5D $60 $61 $64-$67 $69 $6A-$6F` are cleared, and `$3A` (build gate),
  `$35`, `$33`, `$15`, `$2F` are correctly NOT, being below `$3D`. `$0180`
  (attrMask) and `$0380` (xf) correctly survive.
* **`$0500-$06FF`.** Four indexed stores × 128 = `$0500-$05FF` + `$0600-$06FF`;
  `state.coll` is `Uint8Array(0x200)`. ✔
* **The renderer.** This commit touches only `games/gradius/**` and `docs/**`
  (git show --stat), so the root batman visual suite is not in scope, and the
  gradius `& $E3` cannot reach the picture (section 3).
* **`mode5Tail(…, test1B)` being an invented entry point.** `$9A88 LDA $1B /
  10 38` branches to `$9AC4`; `$9660`, `$96A2` and `$98E2` all `JMP $9A8C`,
  past it. The default `false` is the three-arm entry and `true` is the
  fall-through. Correct — and the commit is honest that it is unfalsifiable
  today.

## What I could not do, and why

* **`$8871`'s 2304-byte image.** Still not drawn; only `$882C`'s RAM effects
  are. Named at `src/flow.js fullScreenLoad()` and in the impl worklog, and the
  oracle rows carry no nametable, so **no check in the gate can see it**. On a
  respawn the port keeps the previous screen's tiles outside the 384 px the
  intro rebuilds. Disclosed, not hidden — but it is a picture-level gap under a
  green gate, which is `docs/knowledge/02` trap 2, and it should not be allowed
  to go quiet.
* **`$9B3E` on the respawn is not compared** (`intro-respawn` aligns at 614,
  the frame `$979D` runs). The impl says so. Wave 5 should re-align to ~611.
* I did not re-record all 21 scenarios (≈15 min each pass); two were enough to
  establish the recordings are genuine and reproducible.

## If someone picks this up cold

* One code change is wanted: `src/flow.js introPackets()` should end with
  `state.build.ahead = 0;  // $9C0B STA $57` (and a note for `$9C0F STA $5E`,
  which has no reader in the PRG), and its listing extended past `$9C07` to
  `$9C11 RTS` with `sub_9C09`'s two other xrefs named. Do it in the same commit
  as the `04-impl` worklog's `$5E` paragraph, which the store explains.
* Two doc fixes: `scenarios.json intro-boot.why` "twenty-two frames" -> 21.
* If you touch `introTerrain()`, `tests/flow.test.js` test 4 is the only thing
  between you and a counter. I proved that by mutation; do not delete it.
