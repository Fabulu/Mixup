# Review of wave 12 — $A3B1 single-enemy spawn + the throw audit (commit f6558dd)
status: DONE
wave: 12   role: review   started: 2026-08-01

## The task, as I understood it
Read the diff, do not edit src/, do not commit. Verify the new code against the
cartridge bytes, the fall-through trap, that the new scenarios reach the state
they claim, that the new checks can fail (break >= 2, watch red, restore, hash
both ways), that the 36 pre-existing scenarios did not regress, and run the gate
myself.

## What I MEASURED

### The gate, run by me

```
node --test games/gradius/tests/
# tests 318   # pass 318   # fail 0   # skipped 0   # todo 0

node games/gradius/tools/test-all.mjs
  PASS inputs / unit tests / assets / sound data / port trace shape /
       rendergate / compare.mjs / self-check
  GREEN -- 8 passed, 0 failed, 0 SKIPPED

compare.mjs (inside the gate):
  42 scenarios, 14098 of 14098 frames compared, 0 failures, 0 stale
  annotations, 0 display-list coverage failures, 0 deep-reach failures,
  6 fields SKIPPED (pad2 oamBudget spriteOverflow scanline cpuCycle splitSpins
  -- pre-existing)
  DISPLAY LIST: 902272 slot-frames, 201161 live, 0 Y and 0 content mismatches
  DEEP REACH: [PASS] deep-page4 align 2300 scroll $03E1, port reaches $B6E1
              at frame 2490

python games/gradius/tools/verify_assets.py --self-test
  49 of 49 mutations reddened their target; 14 of 14 families seen red
```

Every number in the implementer's report reproduced. The 6 SKIPPED fields are
compare.mjs field-level skips that predate this wave; the STAGE skip count is 0.

### The ROM bytes, checked against the cartridge myself

`dis6502.py "Gradius (USA).nes" linear` at $A3B1-$A3E3, $A340-$A3B0, $A527,
$A579-$A591, $B026-$B0B2, $B140-$B208, and the whole 42-entry $AE1C table.

* `$A3B1` transcription exact, including `$A3D0 SBC #$30` taking the CMP's
  carry, the DEX/BPL allocator, and the bare `$A3BB RTS` that DROPS the spawn.
* `$A579` begins `STA $98`, so the port's `applyStyle(b & 1)` is right even
  though the comment cites `LDA $98` -- checked because it looked wrong.
* `$B026`/`$B033`/`$B038`-`$B083`/`$B098` exact, including the OPPOSITE senses
  of `$B031 CPY/BCS` and `$B0AB CMP/BCS`, and the `$B07B BNE` fall-through into
  `$B07D` (modelled as `if (muz === 0) muz = read($B08C+y)`).
* `$B184`, `$B198`, `$B1AA`->`$B1B1` fall-through, `$B1C5`..`$B1EE` exact.
* FALL-THROUGH TRAP, walked on every new routine: $A3B1 ends $A3E3 RTS;
  $B033 falls into $B038; $B038 ends $B083 JMP $AEDD; $B098 ends $B0AD BCC;
  $B184 ends $B197 RTS; $B198's init falls $B1A7 -> $B1AA -> $B1B1 -> $B1C1 RTS;
  $B1EE JMP $B251. All modelled correctly.
* Tables: $B086-$B097 = `74 73 72 75 76 77 | 01 01 06 05 05 00 | 03 03 06 08 08
  00`, $B200-$B204 = `00 00 01 00 00`, $B205 = `BD 0C 03`. The exported
  assets/enemies/tables.json blocks match byte for byte, at the right base.
* $AE1C entries: 6=$B198, 7=$B6E1, 9=$B311, 12=$B3CB, 15=$AF2E, 16=$AF88,
  17=$B026, 18=$B098, 19=$B747. The header's arithmetic (13 ported entries =
  10 distinct routines; 29 unported = 24 distinct) checks out.
* `assets.js romByteReader` throws outside exported ranges, so the two new
  exports are load-bearing, not decoration.

### Does deep-page3 reach the state it claims? YES -- read out of the recording

`out/scen/deep-page3.json`: inputScript `200:,10:S,190:,1350:RD,324:RU,80:RD,
326:R`, 2480 frames, align 1900, so 579 compared frames.

* f1900 scroll $0319, f2479 scroll $043B.
* type $92 first appears at f2106 (scroll $0380); type $86 at f2234.
* muzzle index $0496,X is NON-ZERO in the window and IS compared:
  w_049F first non-zero at f2106 (=3), w_0496 342 frames, w_049E 310 frames.
  Wave 11's "measured always 0" byte is now driven and watched.

### Re-recorded the oracle side myself -- BIT-IDENTICAL

```
python games/gradius/tools/oracle/scen.py --only deep-page3   (then deep-page4)
sha256 deep-page3.json 39c37e97... before AND after   (unchanged)
sha256 deep-page4.json cc0e4854... before AND after   (unchanged)
node compare.mjs --only deep-page3,deep-page4 -> 579/579 frames, 0 failures,
   DEEP REACH [PASS] $B6E1 @ 2490
```

### Re-ran the audit myself: three of the seven runs, from scratch

`throwaudit.py --only deep-survivor / deep-autofire / deep-powered`, 6000 frames
each. Every headline first-frame reproduced exactly:

| hook | my deep-survivor | my deep-powered | impl claim |
|---|---|---|---|
| $A3B1 | 16 @2106 | 39 @2106 | 76, f2106 |
| $B098 | 1408 @2106 | 1860 @2106 | 4663, f2106 |
| $B198 | 444 @2234 | 1563 @2234 | 2451, f2234 |
| $B6E1 | 809 @2490 | 2837 @2490 | 4995, f2490 |
| $B026 | 84 @2682 | 2486 @2682 | 3700, f2682 |
| $B747 | 535 @2907 | 2931 @2498 | 4545, f2498 |
| $96FB | 397 @3380 | 0 | 794, f3380 |
| $97F1 | 1 @3379 | 0 | 2, f3379 |
| $A19E | 0 | 203 @3324 | 203, f3324 |
| $BC59 | 5 @3563 | 0 | 5, f3563 |
| $B311/$AF2E/$AF88/$B3CB | 0 | 1836@2783 / 1165@2778 / 466@5018 / 436@5023 | same |
| $BBC3/$BBE5 | 0 | 0 (with $17 = 4 for 5690 frames) | 0 |
| maxScroll | $04BD | $0A64 | $04BD / $0A64 |

`deep-powered` gates: `$09 = 0 x6000` (no demo contamination), `$17 = 4 x5690`,
`$19/$1A/$3A/$5C = 0 x6000`. The plan's risk 5 really is answered NO for stage 1.

`$B6E1 @ 2490` is now confirmed from BOTH sides independently: the cartridge
exec hook and the port's own throw in the DEEP REACH block.

### EVERY CHECK SEEN TO FAIL -- 4 unit breaks, 3 corpus breaks

src/enemies.js sha256
`ec025ebc71f9d2bf3e6ae26adba12d3ff3f19f150d7a5bbbde39671f06967047`
before every break and after every restore; `git diff HEAD` empty at the end.

| break | check | verdict |
|---|---|---|
| `$B033` `0x0A` -> `0x0B` | node --test | **RED** 2 fail: `$B033: the shot countdown is armed to TEN...`, `$B026: the FLOOR turret...` |
| `$B043` `ax >= 0x30` -> `0x31` | node --test | **RED** 1 fail: `$B043/$B048/$B050/$B055: the four X-band boundaries` |
| `subX16` borrow dropped | node --test | **RED** 1 fail: `$B184 is a REAL 16-bit subtract` |
| `$B062` `ay < 0x30` -> `0x31` | node --test | **RED** 1 fail: `$B062/$B068: the Y refinement adds exactly one` |
| `$B080` `s0480[22+j]` -> `[j+12]` | compare --only deep-page3 | **RED** 6 fields, `w_048C@2138 w_0494@2170 w_0495@2106 w_0496@2138 w_049E@2170 w_049F@2106` |
| metasprite for direction **4** -> 3 | compare --only deep-page3 | **RED** TIER 1 3 fields + **DISPLAY LIST 732 live-slot content mismatches** + hardware OAM 3/256 |
| metasprite for direction **2** -> 1 | compare --only deep-page3 | **GREEN** -- confirms the impl's own finding that $B06D's Y is never 2 |

So the four "unwitnessed" pins are real, and the display-list watch really does
see a sprite regression on the new code.

## What I RULED OUT

* No collateral damage: `git rev-parse f6558dd^:games/ddpdoj` ==
  `f6558dd:games/ddpdoj` and the same for `games/batman`;
  `git diff --diff-filter=D f6558dd^ f6558dd` is empty. Nothing ROM-derived in
  the commit (the only ROM bytes are the small EXPECT_* constants in
  verify_assets.py, the house pattern since wave 3).
* `applyStyle`'s `$98` read is not a bug ($A579 stores A into $98 first).
* `dispatch`'s `u8(type << 1)` gives 18 for $92 and 17 for $11/$91 -- correct.
* The 36 pre-existing scenarios did not regress: 42 scenarios, 14098/14098
  frames, 0 failures, display list 0 mismatches, video 0/0/0.
* `scenarios.json`'s 4 re-indented `enemy-bullet*` blocks are whitespace only.

## What I found

1. MODERATE -- `throwaudit`'s RAM-gate histograms merge live play with the
   ATTRACT DEMO that resumes AFTER GAME OVER inside a scripted run. My
   `deep-survivor` (unpowered, no pokes) prints `$17: 0x4191, 3x1809`,
   `$45: 2x1809`, `$46: 5x1809`, `$41: 1x1809`, `$09: 1x1837` -- all beginning
   after $96FB at f3380. PROBE.md documents only the "script never presses
   START" form of this trap. Read naively the table says an unforced run reached
   rank 3 with two Options and a shield, which contradicts the worklog's own
   (correct) sentence "an unforced run reaches 0-1".
2. MINOR -- `deep-page3`'s `why` claims type `$85` (the fan, $B0AF) is live in
   the compared window. Measured: $85's last frame in that recording is 1664,
   237 frames before the window opens; the window holds $04, $84, $86, $88, $92
   only.
3. MINOR -- the `$BC59` row's "reached naturally... a long deep run reaches it
   for free" happens at f3563, i.e. 183 frames INSIDE the game-over sequence
   ($1B = $C0 from f3380), not during live play.
4. MINOR -- `00-plan.md` lines 521-527 still say `$A3B1` and the missile crawl
   path are "listing-only -- no run has exercised them". Rule 5.
5. MINOR -- `src/collision.js:538,543` still carry the bare "no measured run has
   spawned type $27/$29" -- the exact sentence form this wave exists to retire.
   The audit has the number (0 of 27,400 frames) and it was not written in.
6. INFORMATIONAL -- `deep-powered` holds `$46 = 5` EVERY frame (a permanently
   refilled shield), which is why it reached $0A64 while every unpowered run
   stalled at $04BD. The four handlers it found are genuinely wave-list-driven
   at that scroll, but the depth was harness-assisted.

## If someone picks this up cold

* The port is SOUND. Nothing in the new code diverges from the cartridge at any
  address it cites, the gate is green with 0 skipped stages, and the new
  scenario really does compare 579 frames through scroll $0380.
* The next wall is `$B6E1` at frame 2490, confirmed from both sides.
* THE SHARED INDEX IS ARMED: `git diff --cached --stat` currently stages the
  REVERSAL of all 16 wave-12 files (and ~107 ddpdoj/publish files). Committing
  through it without `git read-tree HEAD` first would delete wave 12 AND another
  agent's work. The worktree itself is clean against HEAD.
