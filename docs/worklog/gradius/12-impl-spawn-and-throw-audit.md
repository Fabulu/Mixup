# Wave 12 — port $A3B1 (the single-enemy spawn), then audit EVERY remaining throw

status: DONE
wave: 12   role: impl   started: 2026-08-01

## The task, as I understood it

Two jobs.

1. Port `$A3B1`, the single-enemy spawn taken when a wave-list command byte is
   `< $80`. It is one of the two paths the owner CRASHED INTO in ordinary play
   (`06-FINDING-scroll-coverage.md`): thirty seconds of scrolling past `$0380`.
2. The more valuable half: audit **every** remaining unported throw in
   `games/gradius/src/` for REACHABILITY IN PLAY, **mechanically**, and rank
   them. For anything I cannot reach: "I could not reach it, here is what I
   tried" — never "the game does not do this".

---

## What I built

### 1. `$A3B1`, and the two handlers stage 1 reaches through it

Porting `$A3B1` alone moves the crash rather than removing it — the enemy it
spawns is a type the dispatcher cannot handle. Wave 10 had already measured
exactly that and written it into `deep-page4`'s annotation. So this wave is
four routines, not one:

| ROM | what | why it had to be in this wave |
|---|---|---|
| `$A3B1` | the single-enemy spawn | the owner's crash |
| `$B098` | the aiming turret, ceiling form (entry 18, types `$12`/`$92`) | stage 1's cmd `$00` at scroll `$0380` spawns type `$12` |
| `$B026` | the same turret, floor form (entry 17, `$11`/`$91`) | shares `$B033`/`$B038` with `$B098`; half a routine is worse than all of it |
| `$B198` | the arcing enemy (entry 6, `$06`/`$86`) | cmd `$01`/`$02` at `$03C0`/`$03E0` spawn type `$06` |
| `$B184` | `X -= xvel`, 16-bit | `$B1E5`, the arm that turns the arc around, is now live |

`$A3B1`'s only interesting line is that `$64` carries two things at once:
`$64 - $A0` under `$30` is a type spawning at X = `$F0`, and otherwise
`$64 - $D0` spawns at X = `$10`. Stage 1 uses the first arm for cmd `$00`
(type `$12`), `$01` and `$02` (type `$06`), and the second for cmd `$03`
(type `$07`, at scroll `$0440`).

The turret is the more interesting routine. It does not move under its own
power — both forms tail into `$AEDD`, i.e. 0.5 px/frame left, which is the
camera's own scroll rate, so it sits still relative to the terrain. What it
does is **aim**: `$B038-$B06C` turns its position relative to the ship into a
direction code 0..5, and writes both the barrel metasprite (`$B086,Y`) and
`$0496,X` — the muzzle index `$BC90 LDX $0496,Y` reads when this enemy fires.
That is the array wave 11 measured as **0 for every stage-1 squadron**. The
turret is what makes it non-zero, which is why the two waves belong together.

Two ROM tables were added to `export_assets.py`, both anchored on the
instructions either side (`$B083 JMP $AEDD` / `$B098 LDA #$92`, and
`$B1FD JMP $B1F4` / `$B205 LDA $030C,X`):

* `turretFrames` `$B086-$B097` — three parallel 6-entry rows (metasprite, and
  the muzzle index for bit-7-clear and bit-7-set `$018C`);
* `arcTurns` `$B200-$B204` — five bytes, `00 00 01 00 00`.

`arcTurns` is exported at FIVE, not six, deliberately: a sixth byte would be
`$B205`'s `LDA $030C,X` opcode `$BD`, which reads as a perfectly plausible
non-zero "turn right" flag. `h_B198` throws a named error at `$04AC >= 5`
rather than letting the reader's generic out-of-range message fire.

### 2. `tools/oracle/throwaudit.lua` + `throwaudit.py`

The mechanical answer to "which throws does a player reach". 79 exec hooks —
one per ROM address named by a loud throw in `src/`, plus **all 42 entries** of
the `$AE1C` handler table — driven by seven long, varied scripts. Plus 19
per-frame RAM gates, because several throws are not a branch the cartridge
takes but a VALUE the port refuses (`$18`, `$19`, `$1A`, `$3A`, `$5C`, `$17`,
`$42`, `$0360`), and for those an address hook answers the wrong question.

**Two traps I fell into and wrote into PROBE.md 5, because both produce a table
that looks fine and is wrong:**

1. **Hook the ARM, not the test.** `$9663` is `LDA $19 / CMP #$04 / BNE $96A5`
   and executes every frame; the stage-5 census starts at `$9669`. My first run
   reported **1613 hits for a path nothing reaches.** Same for `$982A` (the
   dispatch, not its arms) and `$A17C`/`$C3AD` (which have no arm address of
   their own at all — both land on code the normal path also reaches, so they
   are RAM gates now).
2. **A script that never presses START runs the ATTRACT DEMO.** My first run
   used `400:,...` instead of the corpus's `200:,10:S,190:` and measured the
   demo playing itself — `$09` set, `$9C5E` executed at f414, and `$45 = 2`,
   `$46 = 5`, `$41 = 1`, `$17 = 3` for the whole run.

---

## What I MEASURED

### The gate

```
node --test games/gradius/tests/
# tests 318   # pass 318   # fail 0   # skipped 0   # todo 0
```

```
node games/gradius/tools/test-all.mjs
GREEN -- 8 passed, 0 failed, 0 SKIPPED
```

(the skip count is **0** at both levels; the full stage list and the
`compare.mjs` verdict line are pasted in §"the gate, in full" below)

```
python games/gradius/tools/verify_assets.py --self-test
49 of 49 mutations reddened their target; 14 of 14 families seen red
```

— 39 before this wave, 49 after: `turret-frame`, `turret-muzzle-shift` and
`arc-turn` are new, and all three redden `enemies`.

```
python games/gradius/tools/oracle/scen.py      # the WHOLE corpus, re-recorded
=== ORACLE CORPUS: 43 scenarios, align frame 400, 1022 watched addresses ===
```

### THE REACHABILITY TABLE

`python games/gradius/tools/oracle/throwaudit.py` — **27,400 cartridge frames,
7 scripts**, exec hooks. `first` is the game frame of the first execution.
Ranked by how easily a player gets there.

| rank | throw / ROM | ported? | reachable? | hits | first | what it took to reach it |
|---|---|---|---|---|---|---|
| 1 | `$A3B1` single-enemy spawn | **YES (w12)** | **YES** | 76 | 2106 | scroll past `$0380`. The owner did it in thirty seconds. |
| 2 | `$B098` turret entry 18 | **YES (w12)** | **YES** | 4663 | 2106 | the enemy `$A3B1` spawns at `$0380` |
| 3 | `$B198` arc entry 6 | **YES (w12)** | **YES** | 2451 | 2234 | `$A3B1` again, cmd `$01`/`$02` at `$03C0`/`$03E0` |
| 4 | `$B6E1` handler entry 7 | no | **YES** | 4995 | 2490 | `$A3B1` again, cmd `$03` at `$0440` → type `$07`. **THE NEXT WALL** |
| 5 | `$B747` handler entry 19 | no | **YES** | 4545 | 2498 | eight frames after the one above |
| 6 | `$B026` turret entry 17 | **YES (w12)** | **YES** | 3700 | 2682 | keep scrolling. Note: 203 frames PAST the deepest compared window. |
| 7 | `$96FB` GAME OVER | no | **YES** | 794 | 3380 | lose three lives. `$20` reads 255 on 796 frames. |
| 8 | `$97F1` lives went negative | no | **YES** | 2 | 3379 | the same; it is `$96FB`'s doorway |
| 9 | `$B311` handler entry 9 | no | **YES** | 1836 | 2783 | only on the POWERED run (rank `$17` = 3-4) |
| 10 | `$AF2E` handler entry 15 | no | **YES** | 1165 | 2778 | powered run |
| 11 | `$AF88` handler entry 16 | no | **YES** | 466 | 5018 | powered run, deep (scroll `$0A64`) |
| 12 | `$B3CB` handler entry 12 | no | **YES** | 436 | 5023 | powered run, deep |
| 13 | `$A19E` missile CRAWL | no | **YES** | 203 | 3324 | own missiles (`$41 = 1`) AND fly deep enough to meet real ground |
| 14 | `$9C5E` pause-code cheat | no | **YES, but not from `$9B10`** | 4 | 4191 | executed only AFTER game over, i.e. by the continue screen — never from a live pause. See below. |
| 15 | `$8473` `$09` scoring gate | n/a | **YES** | 105 | 4366 | after game over, when the attract demo resumes |
| — | `$BC59` enemy bullets (w11) | YES | **YES, naturally** | 5 | 3563 | **no pokes.** The four `enemy-bullet*` scenarios poke `$040C`; a long deep run reaches it for free. |
| — | `$C1D6` death (control) | YES | YES | 18 | 493 | — |

**Not reached by 27,400 frames of these seven scripts.** I could not reach
these; here is what I tried (below the table).

| throw / ROM | hits | the strongest thing I can say |
|---|---|---|
| `$A37A`/`$A466`/`$A46F`/`$A4A6` (`cmd >= $F0`) | 0 | stage 1's four wave lists carry no cmd `>= $F0` at all — I read all four out of `assets/enemies/tables.json`. Reaching it needs another stage. |
| `$C413` stage advance | 0 | `$3A` is 0 on all 27,400 frames and `$1B` never leaves {0,1,2,3,4,`$80`,`$A0`,`$C0`} |
| `$BBC3` / `$BBE5` rank ladder | 0 | `$BBC1`'s BEQ jumps the whole ladder while `$19 | $1A` is 0, and both are 0 on all 27,400 frames — **even on the run where `$17` reached 4 for 5690 frames.** This is the plan's risk 5, answered NO for stage 1 by measurement rather than by argument. |
| `$BC63` bullet alloc failure | 0 | needs ten live bullets; the natural run made five |
| `$BC77` bullet kind 1 | 0 | needs a firing enemy with status `$80-$8F`; no stage-1 enemy has one |
| `$C05F` armoured, `$C099` type-`$9A` | 0 | no stage-1 squadron sets the bit or the type |
| `$C13D` type `$27`, `$C159` type `$29` | 0 | never spawned |
| `$C18C` every-16th / destroy-everything | 0 | `$47` never reached a multiple of 16 in these runs |
| `$C2DC`/`$C32F` breakable wall | 0 | I reached scroll `$0A64` and still hit none |
| `$C24B` bullet kills the ship | 0 | the five natural bullets all missed |
| `$C03D`/`$C263`/`$C290` stage 5 | 0 | `$19` is 0 on all 27,400 frames |
| `$9669` stage-5 census | 0 | same |
| `$96CF` NEXT STAGE | 0 | needs the end of stage 1 |
| `$9A56` boss page / `$9A0E`..`$984F` sub-states `$81`-`$8F` | 0 | max scroll reached was `$0A64`; stage 1's boss page is `$0C`, i.e. `$0C00` |
| entries 10, 11, 13, 14, 20-30, 32-38, 40 of `$AE1C` | 0 | 22 handlers; nothing in stage 1's first `$0A64` px dispatches them |
| two-player (`$18`), `$5C`, `$1A` | 0 | all three are 0 on all 27,400 frames |
| `$8984` arms 2-6 (`$42`) | 0 | `$42` only ever read 0 or 1 |
| `$88E5` with `$0E < 4` | 0 | `$0E` read {1,9,12,13,15,29,37,38,40,45,49,90,149} |
| `$C3AD` (`$0360 == 0`) | — | **`$0360` DID read 0, on 16 of 27,400 frames.** The port's comment says the clamp `[16,240]` makes it unreachable; the clamp holds while the ship is ALIVE, and those 16 frames are respawn frames where `$0100 >= 2`, which is exactly the gate `$C2B5` uses before the probe. So the throw is still unreached — but the comment's reasoning is one step short and I have changed nothing about it except this note. |

**How I tried.** Seven scripts, listed in `throwaudit.py` with their rationale:
`deep-survivor` (6000 frames on the only trajectory measured to survive stage
1's opening), `deep-autofire` (the same with A held), `deep-powered` (the same
again with `$44 = 2`, `$45 = 2`, `$46 = 5`, `$41 = 1` poked — the ONLY way past
rank 3, exactly as the brief says: an unforced run reaches 0-1 and this one
reached 4 for 5690 frames), `left-hugger`, `floor-hugger`, `wander` (24
direction changes), `die-thrice`. Max scroll reached: `$04BD`, `$04BD`,
**`$0A64`**, `$01BD`, `$01B4`, `$01BB`, `$01B9`.

**The single most useful number in the table** is that `deep-powered` reached
`$0A64` and four otherwise-unreached handlers, while every unpowered run
stopped at `$04BD`. Power-ups are not a corner case; they are how the game is
normally played, and they are what gets a player deep enough to meet the code
nobody has ported.

### The new code, seen red — and FOUR BREAKS THAT PASSED

`deep-page3`'s tail was extended from `32:RD` to `80:RD,326:R`, so it now
compares **579 frames, 1900 → 2479, camera `$0319` → `$043B`** — the first
window in this project's history that runs THROUGH scroll `$0380` instead of
stopping in front of it. Nineteen deliberate breaks, each applied to
`src/enemies.js`, graded by `compare.mjs --only deep-page3`, restored, and
sha256'd both ways (`ecb6e8c9…` before and after every one):

| break | verdict |
|---|---|
| `$A3C8` type `SBC #$A0` → `#$A1` | **RED** 171 fields |
| `$A3C3` spawn X `$F0` → `$E0` | **RED** |
| `$A3DE` y `$66` → `$65` | **RED** (port threw) |
| `$A3B1` allocator scans UP not DOWN | **RED** (port threw) |
| entry 18 unwired (wave 10's throw, back) | **RED** |
| entry 6 unwired | **RED** |
| `$B09D` drop the `ORA #$80` | **RED** `w_018C@2138` |
| `$B0AB` arm test `BCS` → `BCC` | **RED** 10 fields, `w_040C@2138` |
| `$B080` muzzle `s0480[22+j]` → `[j+12]` | **RED** `w_048C@2138` |
| `$B083` drop the `JMP $AEDD` tail | **RED** `w_012C@2139` |
| `$B1D0` arc flip `#$FD` → `#$FE` | **RED** |
| `$B1AA` accel `#$20` → `#$21` | **RED** |
| `$B1AF` seed yvel `#$03` → `#$02` | **RED** |
| `$B19D` status `#$02` → `#$01` | **RED** |
| `$B1DA` turn test `BNE` → `BEQ` | **RED** |
| **`$B033` countdown `#$0A` → `#$0B`** | **GREEN** |
| **`$B043` X band `CMP #$30` → `#$31`** | **GREEN** |
| **`$B062` Y band `CMP #$30` → `#$31`** | **GREEN** |
| **`$B184` drop the fraction borrow** | **GREEN** |

**The four that passed are the finding, and each has a different cause.**

* **`$B033`** — the guard immediately above it (`$B0AB`) IS red, 10 fields, at
  the very first turret frame. Both facts together say the guard is exercised
  and always answers NO: the compared window never has the ship above the
  ceiling turret, so the constant has no cartridge witness at all.
* **`$B043` / `$B062`** — the turret in this window sits at dx ≈ `$A0` and its
  dy never sits on a band edge, so a one-unit shift is invisible while the same
  routine's muzzle store and `$AEDD` tail both go red. Textbook
  docs/knowledge/03: reaches the code, interrogates none of its parameters.
* **`$B184`** — and this one is **structural, not a sampling accident.** The
  only caller reachable today is handler 6, whose `$B1B1` seed writes
  `$044C,X = 0` and nothing on its path ever changes it, so `$038C,X - 0` can
  never borrow. Flipping `$B1DA`'s BNE (which CHOOSES `$B184`) is red, so the
  routine runs; the borrow inside it cannot be driven from any input.

All four are now pinned by unit tests — `$B033` in `tests/enemies.test.js`
(it needs a placement, not a boundary), the other three plus the `$B1C5`
overrun guard and `$B026` in `tests/enemies-unwitnessed.test.js`, each carrying
the break that produced it.

**Sixteen more breaks, this time against the UNIT suite**, applied to
`src/enemies.js`, graded with `node --test`, restored, hashed both ways
(`ec025ebc…`): **15 of 16 RED**, each naming the test that caught it —
`$A3C8`, `$A3D0`, `$A3BB`, `$B09A`, `$B043`, `$B050`, `$B062`, `$B068`,
`$B033`, `$B031`, `$B026`'s type byte, `$B184`, the `$B1C5` guard, `$B19D`,
`$B1D0`.

**The sixteenth is a break that passes and I could not fix it, so I wrote it
down instead.** Rewriting `$B07B`'s fall-through (`LDA $B092,Y / BNE $B080`,
which re-loads from the OTHER row when the byte is zero) as a plain if/else is
GREEN on every test in this repo. Measured why: index 5 is the only zero in
`$B092`, and `$B08C[5]` is zero too, so both spellings store 0 and **no input
separates them**. The test that used to claim to catch it has been rewritten to
pin the tables' shape — "index 5 is the only zero in either row" — and to say
plainly that the branch itself is unpinnable while those bytes hold. A test that
has never been red is decoration; so is one that cannot be.

### `deep-page4`: the annotation moved, it was not deleted

Wave 10 pinned `deep-page4` with `expectThrow $B098 @ 2301`. That is now
ported, so the annotation had to change or the DEEP REACH block would fail on a
surprise success — which is the discipline working. It was **replaced, not
removed**: tail `326:R` → `366:R` (window 2301..2519, 40 frames longer) and
`expectThrow $B6E1 @ 2490`, measured on the cartridge BEFORE it was written
down. Verified:

```
=== DEEP REACH (align-frame scroll, past $0380) ===
  [PASS] deep-page4: align 2300, scroll $03E1, port reaches $B6E1 at frame 2490
         unimplemented enemy handler $B6E1 for type $07 (entry 7 of the
         42-entry table at $AE1C) in slot 19.
  [PASS] 1 scenario(s) align past $0380: deep-page4@$03E1
```

### Stale claims retired in this commit (rule 5)

Every one of these was a "no measured run has…" sentence that the audit
falsifies with a number:

| file | was | now |
|---|---|---|
| `src/enemies.js` dispatch throw | "No measured run has ever dispatched it" | names the five entries that ARE reached, with frames, and points at this file |
| `src/enemies.js` header | "$A3B1 … past this corpus"; "34 of the 42 handlers" | ported; **29 of 42 entries** unported (13 ported = 10 distinct routines) |
| `src/weapons.js` `$A19E` | "the crawl arm has never run" | **203 executions, first f3324** |
| `src/nmi.js` `$96FB` | "nothing in this corpus reaches either" | **794 executions, first f3380** — the port's biggest known hole |
| `src/flow.js` `$97F1` | (no number) | **twice, f3379 and f3967** |
| `src/flow.js` `$9C5E` | "no measured run has reached it" | 4 executions, but **only after game over, never from `$9B10`** — the distinction is kept |
| `tests/enemies.test.js` | "34 of the 42 entries are unported" | 29, and entry 7 is annotated REACHABLE |
| `src/enemies.js` `$B184` | "deliberately ABSENT … untested, unreachable code" | ported, with why `$B1FA` still is not |

---

## The gate, in full

```
node games/gradius/tools/test-all.mjs
```

```
PASS  inputs
PASS  unit tests (node --test games/gradius/tests/)
PASS  assets == the cartridge (verify_assets.py --self-test)
PASS  sound data == the measured ownership window (snddata.py --selfcheck)
PASS  port trace shape == probe.lua state vector
PASS  the renderer rebuilds the cartridge pixel-exactly (rendergate.py)
PASS  port vs cartridge (compare.mjs)
PASS  self-check: the comparison goes red when the port is broken
      -- subset clean at 0 failures, 7 deliberate breaks all red

GREEN -- 8 passed, 0 failed, 0 SKIPPED
```

```
node games/gradius/tools/oracle/compare.mjs
```

```
42 scenarios, 14098 of 14098 frames compared (0 truncated: none), 0 failures,
0 clamps uncovered, 0 death-coverage failures, 0 stale annotations,
0 display-list coverage failures, 0 video-coverage failures,
0 deep-reach failures, 6 fields SKIPPED
  (pad2 oamBudget spriteOverflow scanline cpuCycle splitSpins)
```

(42 field-compared + 1 `expectThrow` = the 43 in `scenarios.json`. The frame
count is up from 13,519 because `deep-page3` grew 205 -> 579 and `deep-page4`
40; every one of those 374 new `deep-page3` frames is past scroll `$0380`.)

Everything else in that run, for the record:

```
=== DISPLAY LIST COVERAGE ($0200-$02FF) ===
  42/42 scenarios compared, 902272 slot-frames, 201161 live
  [PASS] 0 Y mismatches, 0 live-slot content mismatches
=== CLAMP COVERAGE ===  all four reached
=== DEATH COVERAGE ===  1783 dying frames across 16 scenarios, 19 of 42 carry
                        an expectDying, all matched
=== VIDEO COVERAGE ===  [PASS] 0 nametable (30 strictly graded), 0 palette,
                        0 hardware-OAM bytes differ
```

The one `[STILL BROKEN]` line is the PRE-EXISTING `$8871` knownFail (the
full-screen RLE loader, excluded by `00-plan.md`), matched on 9 of 12 windows
with a stage load — hence `0 stale annotations`. Wave 12 neither introduced it
nor touched it.

`rendergate.py`, inside the gate: **0 of 61440 pixels differ** on all seven
natural frames (f400, f1200, f1700, f2200, f2400, f2600, f3500) and on the
three synthetic sprite frames; the synthetic boundary residual is inside its
stated bound. The numbers did not move, which is expected — it imports no
`src/`.

---

## What I could not do, and why

* **I did not port `$B6E1`, `$B747`, `$B311`, `$AF2E`, `$AF88`, `$B3CB`** —
  the six handlers the audit proves a player reaches. `$B6E1` alone pulls in
  `$B65C`, `$B676`, `$B6B8` and a terrain probe; that is a wave, not a
  footnote, and guessing it from the listing is exactly what this repo forbids.
  They are ranked in the table so the next person picks with evidence.
* **I did not port game over (`$96FB`/`$97F1`).** 794 executions makes it the
  highest-traffic unported arm in the port, and the plan excludes it. That
  exclusion is now the port's biggest known hole and it is written into the
  throw itself.
* **I did not resolve where type `$11`/`$91` (entry 17, `$B026`) comes from.**
  I measured that it runs, 3700 times, first at frame 2682, and that it is 203
  frames past the deepest compared window. I did not chase which record spawns
  it. It is ported and unit-tested, and it is in the `-unwitnessed` file with
  that measurement, honestly labelled.
* **The `$B026`/`$B033` combination has no cartridge witness in the gate.**
  Both are held by unit tests only. A scenario aligned near frame 2682 would
  fix that and I ran out of wave.
* **I did not run the browser.** Same standing gap as wave 11: the gate proves
  the port does not throw on these paths, not that the page renders them.

---

## If someone picks this up cold

* **The next wall is `$B6E1` at frame 2490**, and `deep-page4`'s `expectThrow`
  says so out of the gate. When you port it: re-run
  `python games/gradius/tools/oracle/throwaudit.py`, move the annotation to
  whatever the new wall is, and extend `deep-page4`'s tail to contain it. Do
  not delete the annotation.
* **`throwaudit.py` is the tool for the "is this reachable" question.** Read
  PROBE.md 5 first — the two traps (hook the arm not the test; press START or
  you measure the attract demo) are both easy to fall into and both produce a
  table that looks right.
* **`deep-page3` is now the deep comparison** (579 frames, 1900-2479) and
  `deep-page4` is the wall marker. They share one trajectory on purpose.
* **Four constants in the new code have no cartridge witness** (`$B033`'s ten,
  `$B043`/`$B062`'s band edges, `$B184`'s borrow). They are unit-tested and
  each test says so. If you widen the corpus past frame 2682, check whether any
  of them becomes witnessed and say so in the test comment.
* **`arcTurns` is exported at five bytes, and that length is MEASURED.** The
  `$B1C5` hook reads the Y register: 2439 executions, Y = 0 (558), 1 (550),
  2 (550), 3 (550), 4 (231), **never 5**. The enemy walks the whole schedule and
  `$B251`'s box frees it one entry before the overrun. My first reading of the
  routine reasoned it would be freed inside its first arc, i.e. Y = 0 only —
  **that was wrong, and the measurement caught it before it went into a comment
  as a fact.** `h_B198` throws by name at Y >= 5 anyway, because the cartridge
  stops exactly one read short.
* **`$B06D`, the turret's direction code, only ever takes 0, 1, 3 and 4.** Same
  hook, 8363 executions: 0 (26), 1 (13), 3 (2740), 4 (5584) — **never 2, never
  5**, which are precisely the two codes the Y refinement produces. So
  `$B062`/`$B068`'s INY has no cartridge witness in either direction and the
  metasprites it selects (`$72`, `$77`) are drawn by no run made here. That is
  now in the `-unwitnessed` test's comment rather than in nobody's head.
