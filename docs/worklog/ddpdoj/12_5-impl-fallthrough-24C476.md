# WAVE 12.5 - THE $24C476 FALL-THROUGH

status: **DONE** - `$24C476` ported, gated at 0 divergent over 2,571 board
frames with five red mutations, and the whole of `games/ddpdoj/src/` audited for
other quiet returns. One further inaccuracy found and fixed (`player.js`'s
`$249F16` note understated its own region); one confirmed defect left for its
owner (12-review **F1**, `$24A460`).

wave: 12.5   role: implementer   started/finished: 2026-08-02
target: `ddpdojblk`, VERSION-B (`maincpu_fnv64=D4C25CA9C91B9D47`, 6,291,456 B),
MAME 0.288, `-noreadconfig`, private cfg/nvram. Slowdown figures below are
MAME-timed and uncalibrated (there are none).

Every number in this file was produced on this machine in this session.

---

## 1. THE DEFECT, FROM THE LISTING

12-review **F2**. `python xref.py dasm 24C390 384`, this session:

```
24c3dc: 4a79 0081 2970       tst.w   $812970.l
24c3e2: 6600 0092            bne     $24c476
24c3e6: 4a79 0080 390c       tst.w   $80390c.l
24c3ec: 6600 0088            bne     $24c476
24c3f0: 4a79 0081 3098       tst.w   $813098.l
24c3f6: 6600 007e            bne     $24c476
24c3fa: 0c79 0002 0081 3092  cmpi.w  #$2, $813092.l
24c402: 6700 0072            beq     $24c476
...
24c470: 4eb9 0023 efee       jsr     $23efee.l      <- the second pod shadow
24c476: 082e 0004 0041       btst    #$4, ($41,A6)  <- AND THE NEXT INSTRUCTION
```

Five exits, one destination. Wave 12 wrote `return` on the four gates and
dropped the fall-through. **`$24C476` is not an `rts`; `$24C4F6` is**, and only
one of the four arms below reaches it.

The whole block, transcribed (`xref.py dasm 24C476 130`):

```
24c476: btst #4,($41,A6) / 24c47c: beq $24c4bc        THE EDGE BYTE, not the raw one
24c47e: move.b ($21,A4),D0
24c482: btst #0,($1,A4)  / 24c488: beq $24c48e
24c48a:   move.w #$8,D0
24c48e: lsr.b #1,D0                                   NO mask -- the ship twin has one
24c490: add.b ($37,A4),D0
24c494: move.b D0,($35,A4)
24c498: bclr #3,($1,A6) / 24c49e: beq $24c4ac
24c4a0:   bset #4,($1,A6) / 24c4a6: clr.b ($35,A4) / 24c4aa: bra $24c4d8
24c4ac: bclr #4,($1,A6) / 24c4b2: beq $24c4d8
24c4b4:   move.b #$1,($34,A4) / 24c4ba: bra $24c4f6   THE ONLY PATH TO THE RTS
24c4bc: bclr #4,($1,A6)                               <- runs on EVERY no-edge frame
24c4c2: tst.b ($35,A4) / 24c4c6: beq $24c4f6
24c4c8: subq.b #1,($34,A4) / 24c4cc: bne $24c4f6
24c4ce: subq.b #1,($35,A4) / 24c4d2: bset #4,($1,A6)
24c4d8: move.b ($36,A4),D0
24c4dc: btst #0,($1,A4) / 24c4e2: bne $24c4ec
24c4e4: cmpi.w #$8,($20,A4) / 24c4ea: bne $24c4ee
24c4ec: moveq #$2,D0
24c4ee: move.b D0,($34,A4)
24c4f2: bra $24d480                                   THE PODS' SHOT SPAWN
24c4f6: rts
```

**A6 is the OPTION BLOCK and A4 is the PLAYER here** - the opposite of the
ship's twin at `$249B48`, where A6 is the player. So `($1,A6)` bits 3/4 are
`$8104AB` and `($34,A4)/($35,A4)` are `$81041A/$81041B`.

### It is the POD twin of the ship's own cadence machine, and it is NOT the same

| | ship `$249B48` (`player.js`) | pods `$24C476` (this wave) |
|---|---|---|
| gate | `btst #4,($19,A6)` | `btst #4,($41,A6)` - `$24C13A`'s copy |
| burst / delay | `($2b,A6)` / `($2a,A6)` | `($35,A4)` / `($34,A4)` |
| handshake bits | `($1,A6).3` + `(A6).3` - two records | `($1,A6).3` + `($1,A6).4` - one byte |
| reload | `lsr.w #1` then `andi.b #6`, `+ ($2d,A6)` | `lsr.b #1`, **no mask**, `+ ($37,A4)` |
| delay guard | bit 0 **or** (`($58,A6)==0` **and** `($20,A6)==8`) | bit 0 **or** `($20,A4)==8` - **no `($58,A4)` test** |
| the spawn | `$249BFC`, ported (W8) | `$24D480`, **not** ported (W20) |

Two of those four differences are one instruction wide and both are now covered
by a test that separates them (§5).

## 2. WHAT I BUILT

| file | what |
|---|---|
| `src/options.js` | `fireHandshake()` = `$24C476..$24C4F6` and `fireSpawn()` = `$24C4D8..$24C4F2`; all FIVE exits of `formation2()` route into it; `$24D480` is a loud named throw; `FIRE_MUTATE` (8 mutations, in the shipped file) and `FIRE_ARMS` (the eleven ported write sites, counted) |
| `src/machine.js` | `ROM.optionFireHandshake = $24C476`, `ROM.optionSpawn = $24D480` |
| `src/state.js` | `WATCH_SPEC` += `p20`, `p34`, `p35`, `p36`, `p37`, `oflg1`; all six join `CLAIMED`. `EXEC_SPEC` += the block's **eleven write sites**, named `FIRE_EXEC` |
| `tools/firegate.mjs` | new - the board-trace replay, two modes, two instruments |
| `tools/oracle/pgm.py` | new command `firegate`; `_W4_SYMS` gains `OPT.flags1` and asserts it against `machine.js` |
| `tools/oracle/frame.lua` | new knob **`PROBE_WRITERS`** - a CURPC census of every write to a RAM range. `xref.py` cannot see `(d8,An)` writes at all, so before this there was no way to ask "who writes `$8104AB`?" |
| `tools/breakage.mjs` | `FIRE_EXPECTED_GREEN` - three mutations declared green **before** the run, each with its measurement and the test that does see it fail |
| `tests/fire.test.js` | new - 11 tests, aimed at the arms and mutations the board window cannot reach |
| `src/player.js` | the `$249F16` note's address corrected to `$249EE8` (§6) |
| `docs/.../12-impl-ship-fully-real.md` | §8's "none is a quiet return" corrected in place; `$24D480` added to its table |
| `games/ddpdoj/PLAN-no-recordings.md` | ledger row **L3**'s note corrected |

### What I did NOT port, and why

* **`$24D480` - the pods' shot spawn.** `movem.l D6-D7/A3/A5-A6,-(A7)` /
  `lea $810572,A0` (P1) or `$810C32` (P2, via `tst.w D7` at `$24D490`) /
  `movea.l $8127E8,A1`, then the `$24D2FC`/`$24D35C` template tables indexed by
  `($58,A4)*4` (+4 when `($1,A4)` bit 0) and again by `($20,A4)*2`, two sub-4
  phase counters `($52,A6)`/`($54,A6)`, and a `jsr $23D88E` per record. It is
  W20's whole subject. **Loud named throw carrying `$24D480`**, and the throw
  text prints the two cadence bytes W20 will read.
* **`$24C16E..$24C178` + `$24C310..$24C338` - the held-fire debounce and its
  rejoin.** `$24C172 tst.b ($3f,A6) / beq $24C180` is the LASER, but for the
  first 9 held frames `$24C178 bne $24C310` rejoins the ordinary pod path and
  the board **does** reach `$24C476` while fire is held. The port throws at
  `$24C164` instead. That is LOUD (not a quiet return) and porting it would
  move the block from `$24C180` to `$24D480` on the same frame, so it buys
  nothing this wave - but it is why `shotgate` compares 13 frames, and W20 has
  to port it. Recorded here rather than left to be rediscovered.

## 3. THE MEASUREMENT - `pgm.py firegate`

### Why it is a trace replay and not a live gate (the honest limit)

`$24C4F2 bra $24D480` is reached on the **first** fire frame: a one-frame tap
sets the edge byte, `$24C498 bclr #3` finds bit 3 clear, `$24C4AC bclr #4`
finds bit 4 clear, and control falls into `$24C4D8` and out through the `bra`.
So no full-port run can execute this block and survive - before this wave
`shotgate` blocked on the first tap at `$24C180`, after it the same tap blocks
at `$24D480`. Calling any existing gate's green a result for `$24C476` would be
the wave-12 mistake repeated, so the block is driven directly off the board's
own columns.

* **free-running** (headline): seed `p34`/`p35`/`oflg1` from the board **once**,
  then carry the PORT's outputs forward and compare every frame. Nothing
  re-synchronises it.
* **re-seeded**: entry state from the board at frame N−1, inputs from frame N,
  outputs compared at frame N - every frame an independent board transition.

Two instruments: the VALUES, and the **eleven `PROBE_EXEC` counters** that say
which write sites the BOARD executed, against `FIRE_ARMS`'s count of the same
eleven in the port. A port that reaches the right values down the wrong arm is
red on the second.

### The run

```
python games/ddpdoj/tools/oracle/pgm.py firegate            (FRESH, stage1-shot)
  MACHINE romname=ddpdojblk maincpu_size=6291456 maincpu_fnv64=D4C25CA9C91B9D47
  CENSUS logicframes=4572   BUILD required=B frames_on_required=3873 frames_on_other=699

  CENSUS exec_fhb4x pc=$24C4BC total=2448 over 4572 logic frames
  CENSUS exec_fh35w pc=$24C494 total=129     CENSUS exec_fh34w pc=$24C4EE total=387
  CENSUS exec_fh34d pc=$24C4C8 total=774     CENSUS exec_fh35d pc=$24C4CE total=258
  CENSUS exec_fhb3c pc=$24C498 total=129     CENSUS exec_fhb4c pc=$24C4AC total=129
  CENSUS exec_fhb4y pc=$24C4D2 total=258
  CENSUS exec_fh35z pc=$24C4A6 total=0       CENSUS exec_fhb4s pc=$24C4A0 total=0
  CENSUS exec_fh34i pc=$24C4B4 total=0

  WINDOW lf2001..4572: 2572 frames, 2572 with the board IN $24C476, 0 without
  SEEN  fire edges (oedge bit 4) on 128 frames; the cadence pair non-zero on
        2571 frames; $24D480 (the pod spawn) signalled on 386 frames
  BOARD ($34,A4)/($35,A4) non-zero on 2572 of 2572 frames; max ($35,A4) = 2
  ARMS  fh35w=128/128 fh35z=0/0 fh35d=258/258 fh34i=0/0 fh34d=774/774
        fh34w=386/386 fhb3c=128/128 fhb4s=0/0 fhb4c=128/128 fhb4x=2443/2443
        fhb4y=258/258   (port/board)
  RESULT free-running: 2571 frames compared, 0 DIVERGENT
  RESULT re-seeded:    2572 frames compared, 0 DIVERGENT
```

**`$24C4BC` executed 2,448 times on the board in this run.** Until this commit
the port executed it zero times. That single census line is the defect, and it
is a number rather than a reading of the listing.

The done-when the plan set for this block - *"the bytes must be seen NON-ZERO
in-window, stated on the scenario"* - is met and stated: `($34,A4)`/`($35,A4)`
are non-zero on **2,572 of 2,572** compared board frames, `($35,A4)` reaching 2;
128 fire edges; `$8104AB` alternating `$03`/`$13`, i.e. bit 4 moving.

### Red validation, and the three that are declared green

```
pgm.py firegate --reuse --break handshake-dropped   RED  (free DIVERGE p34 lf=2002 port=3 board=2)
pgm.py firegate --reuse --break bclr3-inverted      RED  (p35 lf=2021 port=0 board=2)
pgm.py firegate --reuse --break bclr4-inverted      RED  (p34 lf=2021 port=1 board=3)
pgm.py firegate --reuse --break burst-no-bias       RED  (p35 lf=2021 port=0 board=2)
pgm.py firegate --reuse --break noedge-rts          RED  (p34 lf=2002 port=3 board=2)
pgm.py firegate --reuse --break edge-on-raw         EXPECTED-GREEN OK
pgm.py firegate --reuse --break burst-mask-6        EXPECTED-GREEN OK
pgm.py firegate --reuse --break delay-no-two        EXPECTED-GREEN OK
```

`handshake-dropped` **is wave 12's own code**, reproducible from outside the
source file. It is red on the first divergent frame of the window.

The three EXPECTED-GREENs are declared in `tools/breakage.mjs
FIRE_EXPECTED_GREEN` with the measurement that makes them invisible here - all
three from the same 2,572-frame TSV:

| mutation | why `stage1-shot` cannot see it | where it IS seen red |
|---|---|---|
| `edge-on-raw` | `($40,A6)` and `($41,A6)` agree on bit 4 on **all 2,572 frames** - one-frame taps make every held frame an edge frame (0 disagreements measured) | `tests/fire.test.js` "the gate is the EDGE byte", raw `$10` with edge `$00` |
| `burst-mask-6` | `($21,A4)` is 0 on all 2,572 frames (the whole word `($20,A4)` is 0), so `lsr.b #1` and `lsr.w #1 / andi.b #6` both give 0 | same file, `($21,A4)` = `$0E`: `$0E>>1` = 7, `7&6` = 6 → 9 vs 8 |
| `delay-no-two` | bit 0 of `($1,A4)` is 0 on all 2,572 frames and `($20,A4)` is never 8, so `$24C4EC` is never taken | same file, `($20,A4)` = 8 with `($58,A4)` = 2 (which the ship's twin would reject and this one must not) |

**The first draft of `handshake-dropped` was itself a check that could not
fail** - it lived in `formation2()`, which `firegate` bypasses, and it printed
`0 DIVERGENT`. It was moved into `fireHandshake()` and re-run before being
believed. Recorded because the brief says to assume a check cannot fail until
it has been watched go red, and this one had to be fixed to earn it.

## 4. A SECOND SCENARIO, AND WHAT IT FOUND

`pgm.py firegate speedmodes` (held fire, held button 3) does **not** pass, and
the reason is a measurement worth keeping:

```
BLOCKED at lf2869: the board took $24C4A0/$24C4A6, the arm whose input --
bit 3 of $8104AB -- is written by $2497F2, inside the UNPORTED $2497BA
auto-shot block. 468 of 1087 in-block frames dropped.
RESULT free-running: 618 frames compared, 0 DIVERGENT
```

`$24C476` only ever **clears** bit 3 (`$24C498`). So the bit-3 arm firing at all
proves an outside writer, and `PROBE_WRITERS` - the knob this wave added -
names it:

```
PROBE_WRITERS=8104AA-8104AB,81041A-81041B  on speedmodes, 3,400 logic frames
  CENSUS writer addr=$8104AA pc=$24C0C8 n=1291 firstlf=1967   the init bset
  CENSUS writer addr=$8104AA pc=$24C4BC n=1045 firstlf=1995   THIS BLOCK
  CENSUS writer addr=$8104AA pc=$2497DE n=61   firstlf=2840
  CENSUS writer addr=$8104AA pc=$2497F2 n=60   firstlf=2840
  CENSUS writer addr=$8104AA pc=$24CBCC n=79   firstlf=2439
  CENSUS writer addr=$81041A pc=$24C2CE n=18   firstlf=2480
  ... 35 sites in total

2497b2: btst #6,($18,A6)          MIRROR BIT 6 = AUTO-SHOT
2497c0: lea $8104AA,A0            <- A0 IS THE OPTION BLOCK
2497de: bclr #3,($1,A0)
2497e4: bchg #4,($1,A6) / bne $2497fe
2497f2: bset #3,($1,A0)
2497f8: bset #4,($19,A6)          <- and it SYNTHESISES the shot edge
```

So the pods' bit-3 arm is the **auto-shot** handshake, and `src/player.js`
already throws on `$2497BA`. `firegate` blocks rather than comparing against a
state the port cannot produce - the `shotgate`-at-`$24C180` idiom - and exits
non-zero even with 0 divergent frames, because a gate that stops early and says
PASS is what this project keeps being bitten by. `speedmodes` is therefore a
**measurement in this file, not a shipped gate**; `stage1-shot` is the gate.

Consequence for whoever ports `$2497BA`: three of the eleven write sites
(`fh35z`, `fhb4s`, `fh34i`) are 0/0 on `stage1-shot` and only reachable once
auto-shot or a burst-tick-then-edge coincidence exists. They are driven by unit
tests instead (§5) and that limit is stated on the gate's own output line.

## 5. THE TESTS

`node --test games/ddpdoj/tests/` → **174 tests, 174 pass** (163 before; 11 new
in `tests/fire.test.js`, and one wave-12 test corrected - see below).

The new tests exist for what the board window cannot reach:

* the **bit-3 arm** (`$24C4A0`/`$24C4A6`) - `fhb4s`/`fh35z`, 0 on the gate;
* the **rts arm** (`$24C4B4`) - `fh34i`, 0 on the gate, and the only path out of
  `$24C476` that does not end at `$24D480`;
* the three EXPECTED-GREEN mutations, each with inputs that separate them;
* the four gate conditions of formation 2, each asserted to still reach
  `$24C4BC`;
* **the wiring itself**: `formation2()`'s body must contain five calls to
  `fireHandshake` and **zero bare `return;`** - a test that only drove the block
  would have passed on wave 12's code, which had the gates and no tail;
* `$8104AB` bits 0, 1, 2, 5, 6, 7 must survive the block untouched across four
  seed values and both edge states (bit 2 is the LASER LATCH - a port that wrote
  the whole byte would silently drop W24's state).

**One wave-12 test changed meaning and had to be rewritten.**
`tests/ship.test.js` "the gate is on the RAW byte $24C134 copies, never on the
EDGE" asserted `doesNotThrow` for an edge-only frame - and it held **for the
wrong reason**: the edge reached `$24C476`, which the port did not have, so the
routine returned. With `$24C476` ported, an edge alone runs the pods' cadence
machine and the board spawns a pod shot on that frame. The test now asserts the
throw is `$24D480` (never `$24C180`) for the edge and `$24C180` for the raw
byte. The distinction it exists for is sharper, not weaker. This is the same
shape as 11-review F1 and 12-review F1 - a passing test that encoded the port's
gap - and it is exactly why the audit below reads the ROM and not the port.

## 6. THE AUDIT - every `return` in `games/ddpdoj/src/`, against the listing

Method: enumerate 40 bare `return`s across `src/**/*.js`, take the ROM address
cited on or above each, disassemble the branch target, and ask **is it an
`rts`?** Then, separately, take all **79** `$AAAAAA..$BBBBBB` range citations in
the port and disassemble the instruction after each range end, looking for a
routine that continues where the port stops. Enumerate statically, validate
against the listing; only the listing proves absence.

| site | ROM branch → target | board continues? | throw / note? | verdict |
|---|---|---|---|---|
| `options.js` `formation2` ×5 | `$24C3E2/$24C3EC/$24C3F6/$24C402` + fall-through `$24C474` → **`$24C476`** | **YES** | **none** | **THE DEFECT - fixed** |
| `shipsprite.js` `drawShipShadow` ×5 | `$249E84/$249E8C/$249E94/$249E9E` + fall-through `$249EE6` → **`$249EE8`** | **YES** | `note($249F16)`, reached on all five paths | **not** a quiet return; the note understated its region (`$249EE8..$249F14` is five more gates, `$249F4C..$249F88` is P2's copy) - **address corrected this wave** |
| `options.js` `rampUp` ×2 | `$24C8F4`/`$24C8FE` → `$24C904` | no - `rts` | - | clean |
| `options.js` `movePod` | `$24D176` → `$24D186` | no - `rts` | - | clean |
| `options.js` `fireHandshake` ×3 | `$24C4BA`/`$24C4C6`/`$24C4CC` → `$24C4F6` | no - `rts` | - | clean (new) |
| `player.js` tilt ×3 | `$24A432`/`$24A434` → `$24A43E` | no - `rts` | - | clean |
| `player.js` `bombAndShotGuards` ×3 | `bra $249E4E` ×3 | **YES** - `$249E4E` is the ship's image/hitbox tail | the CALLER (`finish`) runs `$249E4E..$249EE2`; 2 of the 3 also `note()` | clean **by structure**: the `return` returns to the caller that continues |
| `shots.js` :247/:254 | `bra $249E4E` | same | same | clean by structure |
| `shots.js` :282/:288 | `$253B90 clr.w (A6) / rts` | no | - | clean |
| `shots.js` :339/:343 | `$253E92 clr.w (A6) / rts` | no | - | clean |
| `shipsprite.js` `drawShip` :121/:124 | `$24A448 bmi $24A482` (fall-through is `$24A44A rts`) / `$24A488 bne $24A480` | no - `rts` | - | clean |
| `shipsprite.js` `drawShip` :184 | `$24A54A bne $24A54E` (fall-through `$24A54C rts`) | no - `rts` | - | clean |
| `shipsprite.js` `drawShipAlt` :201 | `$24A460 bmi $24A46A` | no - `rts` | - | **the `return` is clean; the BRANCH SENSE IS INVERTED - 12-review F1, still open, see §7** |
| `main.js`, `render/*`, `web/*` (17 sites) | - | port-native code, no ROM counterpart | - | n/a |

Range-end sweep, 79 citations: every whole-routine end terminates in `rts`
(`$24C382`, `$24C4F6`, `$23D724`, `$241180`, `$2411E0`, `$241236`, `$241260`,
`$241290`, `$249F88`, `$23BEE8`), a tail-call `jmp` (`$24A632 jmp $23F1FA`,
`$253BD2 jmp $23F3AE`, `$253EBE jmp $23F3AE`, `$24184A jmp (A3,D1.w)`) or a
jump-table `bra` (`$249BF8`, `$24970E`). **`$24C474` → `$24C476` was the only
fall-through into live code.**

Two further things the sweep turned up that are not quiet returns but belong in
the record:

* **The port is LOUD where the board continues, at `$24C164`.** The laser gate
  throws on the first held frame; the board runs `$24C16E tst.b ($3f,A6) /
  subq.b #1 / bne $24C310` and carries on through the ordinary pod path for nine
  held frames before `$24C180`. Loud-and-early is the safe direction, but it is
  why `shotgate`'s window is 13 frames, and W20 must port
  `$24C16E..$24C178` + `$24C310..$24C338` (the pods' angle ramp) to get it back.
* `src/render/capture.js:140` cites the range `$24C40E..$24D25A`, which spans
  the block this wave ported. It is a comment in the *recording* path, not a
  translation, and nothing there executes ROM logic.

## 7. WHAT I DID NOT FIX, DELIBERATELY

**12-review F1 - `$24A460`'s `bmi` is inverted in `drawShipAlt`.** Confirmed
again this session, from the image:

```
24a458: lea $8103E6,A6 / 24a45e: move.w (A6),D0
24a460: 6b08            bmi $24a46a        <- $24A46A IS THE RTS
24a462: 0800 0008       btst #$8,D0
24a466: 6600 024c       bne $24a6b4
24a46a: 4e75            rts
```

The board takes the RTS when bit 15 is **set** and tests bit 8 only when it is
**clear**; `src/shipsprite.js:201` does the opposite, and `tests/ship.test.js`
seeds `$8100` and locks it in. The plan (20-plan §2, W13) assigns F1 to W13
alongside F3/F4/F5/F7, and fixing it moves `drawShipAlt`'s reachability and its
test in the same breath as a `shipgate` re-validation. **It is not this wave's
brief, it is still open, and a reviewer should not read this wave's green
`shipgate` as evidence about it.** F3/F4/F5/F7 are likewise untouched: in
particular `pgm.py check` still does not run `shipgate`, and it does not run
`firegate` either.

## 8. NO REGRESSION - the gates that already existed

```
python pgm.py flyaround                                   (FRESH)
  COLS 72 compared (66 before: p20 p34 p35 p36 p37 oflg1 joined CLAIMED)
  DIVERGE scroll  first at lf=2321: port=0 board=65472
  RESULT 1 of 72 columns diverged                         exit 1
  -- `scroll` is pre-existing (11-review §4b) and W14's. The six new columns
     are 0-divergent over 2,200 frames; measured constant in that window:
     p20=0, p34=0, p35=0, p36=3, p37=2, oflg1=$03.

python pgm.py shipgate                                    (FRESH, both MAME runs)
  SEED lf=2000  2200 logic frames compared (lf 2001..4200)
  STAGED BYTES divergent bucket-frames: 0
  EMITTED LIST divergent frames: 0
  RESULT 0 DIVERGENT FRAMES over 2200 logic frames, staged AND emitted
  DIGEST b800b1edb6670f7b        <- byte-identical to 12-review's digest

node --test games/ddpdoj/tests/    174 tests, 174 pass
```

`fly-around` is button-free, so `$24C476` runs its no-edge arm on every one of
those 2,200 frames and changes nothing - which is precisely why wave 12's gate
was green over a routine it had dropped, and why this wave needed an instrument
of its own.

## 9. WHAT THE REVIEWER SHOULD LOOK AT HARDEST

1. **`firegate` drives `fireHandshake()` directly.** It therefore cannot see a
   defect in how `formation2()` *reaches* it - that is covered only by
   `tests/fire.test.js`'s source-shape assertion (five calls, zero bare
   `return;`). Try deleting one of the four `return fireHandshake(...)` lines
   and check that something goes red. I believe only the unit test does.
2. **The window is chosen by `sum(FIRE_EXEC) > 0`**, a board-side execution
   fact about the unported `$24C934` path. On `stage1-shot` it excludes zero
   frames, so it is inert there - but it is a filter, and filters grow.
3. **Three of eleven arms are 0/0 on the gate.** Everything asserted about
   `$24C4A0`, `$24C4A6` and `$24C4B4` rests on `tests/fire.test.js`, i.e. on my
   reading of the listing, not on the board.
4. **`p20`/`p36`/`p37` are CLAIMED columns the port never writes.** They were
   constant over both scenarios; if any scenario moves them the claim is wrong
   and the column, not a person, should say so.
5. **`bclr` is read-modify-write.** The whole `fhb4x` = 2,448 argument depends
   on the 68000 writing a byte back when the bit was already clear. It is
   measured (the tap fired), not assumed - but check the reasoning.
6. **The `$249F16` → `$249EE8` note change** touches `player.js`, another
   wave's file, and changes an unported-census key string. It compares nothing.
