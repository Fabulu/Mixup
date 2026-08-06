# W62 IMPL - S1: MAKE STAGE 1 END

status: **DONE** -- **STAGE 1 ENDS**, at logic frame 19,217, via the boss's own
10,800-frame timeout. Gate ALL GREEN 53/0/0 (was 51), 808 unit tests, webgate
14/14, build-dist clean with PUBLISH_VERBATIM unmoved at 5. 33 of 33 mutants
RED, 0 survivors. **NO RANK WRITE BECAME REACHABLE.** Boot +719 B. Verified on
the LIVE deployed build `20260805095519` at the same frame as local and as the
headless gate. **ONE DECLARED DEVIATION** (the presentation tier, two invented
transitions) and one state exit deliberately left broken -- SS2.

wave: 62. role: IMPLEMENTER (sole writer to `games/ddpdoj/`).
date: 2026-08-05.
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address is build B
(`$23xxxx..$2Axxxx`) unless a line says otherwise.
brief: `docs/worklog/ddpdoj/49-recon-stage-end.md` (recon), plus 48 (boss),
57 (M1 midboss death), 61 (I2 items).

## GOAL

Stage 1 must END. Recon 49's cheap path: the boss's `$22(a5) = $2A30` =
10,800-frame hard timeout at `$294F3C` -> `$294DD4` -> the §3.2 chain ->
`$242952` -> object type 6 -> `$25FD0C` stage counter -> `$25FD38` rebuild.

## LOG

(appended as findings arrive)

- **[M] STAGE 1 ENDS.** Driven from the shipped bundle's own seed with fire
  HELD, `tools/w62stageendgate.mjs`, **24 of 24 assertions green**:

  ```
  lf 7870   the boss's handler $292902 runs for the first time (W57's wall)
  lf18669   $294F3C spends the 10,799th decrement of $22(a5) -> $294DD4
  lf18670   D-script 6 starts; seven states 0..6 at 18670/18671/18703/18923/
            18999/19008/19016
  lf19143   $293E16 jsr $2595E8 -- $812E06 := 1        (474 frames, NOT 32)
  lf19144   $25962E returns C=1; $242952 runs ONCE; object TYPE 6 created
  lf19145   $25FCFA queues $813144 (= 7) for the DEFERRED kill
  lf19147   the background object LEAVES the object table
  lf19216   $25FD0C: $813092 0 -> 1, $813096 0 -> 4
  lf19217   $25FD38: a NEW background object, $813144 7 -> $B
  lf19218   the distance clock is ZERO; the new object's first frame asks for
            STAGE 2's column stream $228658 -- no wave has ever exported it
  ```

- **[M] RANK: NO RANK WRITE BECAME REACHABLE.** `$81309E` 53, `$81B646` 0,
  `$81B65C` 0, `$81B65E` 0 -- digit-identical at the boss's arrival and after
  the rebuild. `$81B64A` is 2,112 on both, unmoved from W61's figure.
- **[M] RECON 49 3.1 SAID 32 FRAMES; IT IS 474.** `$293DC6`'s init leaves
  `$2(a4) = 0`, not 6, so the state-6 arm is not taken on the arming frame and
  `$A(a4)` is rewritten to `$80` twice before state 6 is reached.
- **[M] RECON 49 5.3 PRICED THE DEVIATION AT ONE SHORT-CIRCUIT; IT IS TWO**
  (`$28DE5C` and `$28D6FC`), and a THIRD exit is left unsatisfied on purpose
  rather than faked (state 4 waits on `$28E7F8`, which is not ported).
- **[M] `$294DD4` STARTS THREE A3 SCRIPTS, NOT ONE** -- 4 and 5 (the two side
  parts falling away) as well as 6.  A port that registered only D-script 6
  stops on the frame the boss dies.
- **[M] THE PLAYER HAS A STAGE-CLEAR PATH AND IT WAS A THROW**: `$249508 tst.w
  $812972 / bne $24A3A2`.  `$812972` has two writers, `$242958`'s neighbour
  `$242968` and `$28D682`, so W62 is the first wave that could set it.

---

## 1. WHAT WAS PORTED

| ROM | insn | what | where |
|---|---:|---|---|
| `$292902` | 10 | the stage-1 BOSS's per-frame handler, every instruction a dispatch | `boss.js handlerBoss292902` |
| `$294AD8..$294DCC` | ~200 | the DAMAGE / PART-DESTRUCTION pass, three per-part blocks, and it FALLS THROUGH into `$294F32` | `boss.js bossDamage294AD8` |
| `$294E3E` / `$294E94` | 40 | the two part-death arms | `part1Death294E3E` / `part2Death294E94` |
| `$294F32` | 13 | **THE 10,800-FRAME TIMEOUT** and its no-live-player re-floor | `bossTimeout294F32` |
| `$294DD4` | 25 | the boss dies: two flag bits, both part deaths, three A3 starts | `bossDeath294DD4` |
| `$2428A6` | 12 | is any player alive | `livePlayers2428A6` |
| `$259554` | 25 | the FIVE-table install and the A2 pre-fill | `scheduler.js installScripts` |
| `$25962E` + `$2596C6` | ~90 | the WHOLE scheduler: five walks, the double pass, the carry | `runScheduler25962E` |
| `$2595E8` `$259962` `$2599B4` `$2599EC` `$25980C` `$25983E` `$2598A2` `$2598D0` `$2598E6` `$25994A` `$259B34` `$259B7E` `$259B9E` `$259BB4` | ~120 | the fourteen slot-table primitives | `scheduler.js` |
| `$293DC6` / `$293E04` | 187 | D-SCRIPT 6, the boss's death animation, seven states | `boss.js` |
| `$29393A`/`$293966`, `$293B82`/`$293BAE` | ~90 | A3 scripts 4 and 5, the two side parts | `partScriptInit`/`partScriptStep` |
| `$2933C2` | 7 | A0 script 1, the hulk's death drift | `a0Script1_2933C2` |
| `$242952` | 25 | **THE STAGE ADVANCE** | `stageend.js runStageAdvance242952` |
| `$28D63C` `$28D566` `$28D5E6` | ~110 | OBJECT TYPE 6, its init and its self-destroy | `makeStageClear` |
| `$25FCFA` `$25FD0C` `$25FD24` `$25FD38` `$25FD82` `$25FD8C` | 45 | destroy, the stage counter, the 22-word wipe, the rebuild | `stageend.js` |
| `$28ECCE` `$28ECB2` `$28EC86` `$28E7A2` `$28E7C0` `$28E7DC` `$28E7E6` `$28EDB6` `$28D552` `$287DC8` `$287DDC` `$28EC86` `$23C47A` `$260EBE` `$27F8C4` `$24631C` | ~130 | the banner sequencer and the eight clears type 6's init runs | `stageend.js` |
| `$25313E` / `$25318E` | 30 | the stage-clear power reset, top level | `resetPower25313E` |
| `$241292` | 2 | type 6's self-kill by ID | `destroy28D5E6` |
| `$24A3A2..$24A428` | 28 | **THE PLAYER WHILE THE STAGE IS CLEARING** -- and it wipes the beam | `player.js stageClearPlayer24A3A2` |

**Five new ROM windows** (`$240F62` 160 B, `$29370A` 80, `$293104` 72,
`$294F68` 40, `$292932` 32 = **384 bytes**). `games/gradius/` NOT TOUCHED.

Three new files, and the number that matters for the port's own stated value -
"a second person can check any line against the original listing without
re-deriving it":

```
[M] src/stageend.js    479 lines   221 distinct ROM addresses cited
[M] src/boss.js        670 lines   322 distinct
[M] src/scheduler.js   428 lines   167 distinct
[M] TOTAL            1,575 lines   687 distinct
```

### 1.1 THE BRIEF'S PREMISE, CHECKED - recon 49 reproduces, with FIVE corrections

Every address, table and census in recon 49 §1–§3 was re-read out of
`out/maincpu.bin` this session and reproduces **exactly**: the freeze word gates
only `$26132C`; `$261138` has no caller; `$242952`'s twenty-five instructions;
`$25FD0C`'s three writes; `$25FD24`'s 22 words; `$25FD38`'s eight resets and its
`($6,A0) := 0`; `$2927F6`'s eight words with `$2A30` seventh; `$294F32`'s
thirteen; `$285496` as the ONE `bset` of `$8130F9` bit 1.

| the recon said | `[M]` this session |
|---|---|
| §3.1 LINK 2: "D script 6 … `#$20,$A(a4)`… **32 frames**" | **474.** `$293DC6` leaves `$2(a4) = 0`, so the state-6 arm is not taken on the arming frame; `$A(a4)` is rewritten to `$80` at `$2940FA` and again at `$293EF2`. State 6 waits **128** frames and it is the LAST of seven. |
| §3.2 the chain: `$294DD4 -> D.start 6` | `$294DD4` starts **THREE** A3 scripts - `$294E88` (4) and `$294EDE` (5) through the two part-death arms, then `$294E34` (6) - and `$294E2C` starts A0 sequencer script 1 as well. A port that registered only D-script 6 stops on the frame the boss dies. |
| §5.2 "BOSS-SIDE TRIGGER 4 routines ~40 insn" | The trigger cannot skip `$294AD8`: `$294F32`'s **only** entry is `$294DCC jmp $294F32(pc)`, the fall-through at the end of the damage pass. The real trigger is ~200 + 25 + 13 + 187 + the scheduler. |
| §5.3 "a **documented, cited** short-circuit that sets `$8130F9` bit 1" (ONE) | **TWO.** `$28D6FC`'s `$24681A(($8,A5))` gate is the second, because `($8,A5)` is written by the same unported `$28DE5C`. A third exit (`$28E7E6`/`$81DFF6`) is left UNSATISFIED rather than faked. |
| §9 "`$28ECCE`'s exit condition … I did not walk it" | Determined. `$28EC86` - called from `$28D566`, sixteen instructions before `$25FCFA` - seeds `$81E026 := $707`, `$81E028 := 7`, `$81E02A := 4`, and `$28ECCE` then returns C=1 for **63** calls and C=0 on the 64th. |

### 1.2 READ PAST THE APPARENT END - three places, and one is the biggest trap here

* **`$2596C6` IS NOT "THE A4 WALK".** Its `dbra` at `$259702` runs off the end
  into `$259706` (A0), which runs into `$259782` (A1) and `$2597CA` (A3); the
  `rts` is at `$25980A`. **One `bsr $2596C6` steps FOUR of the five tables**,
  and the D-scripts live in the last of them. A port that stopped at the label
  would find them never advancing and no instruction to blame.
* **`$294AD8` does not end at an `rts`.** `$294DCC jmp $294F32(pc)` is its last
  instruction and `$294F32` is a different routine with no other caller.
* **`$293966` begins `bra.w $293A44`**, jumping over sixty-nine instructions of
  emitter code that nothing branches back to. Its mirror `$293BAE` reaches the
  same three blocks and finds them gated shut on `$3(a4)` bits nothing sets.
  Two different reasons, same effect, and both are transcribed and named.

## 2. THE ONE DEVIATION, DECLARED

`src/stageend.js`'s header and `PRESENTATION_DEVIATION` carry this; it is
repeated here because a wave that reads only the worklog must still see it.

**THE PRESENTATION TIER IS NOT PORTED** - `$28D9AA` (819 instructions),
`$28E7F8` (299), the HUD tally `$285400..$285568`, the animation-object
subsystem (`$246410`/`$24652A`/`$246800`) and `$28EDC0`. Recon 49 §8 prices it
as wave B and this wave's brief excludes it. It owns THREE of object type 6's
state exits:

| exit | what the ROM does | W62 |
|---|---|---|
| state 1 -> `$B` | `$28DE1E btst #1,$8130F9`, whose ONE producer is `$285496` | **DEV-1**: the port makes `$28DE5C`'s own state assignment and sets the bit itself. Pinned by `tests/w62stageend.test.js` "W62 DEV-1", which **goes RED the moment a second producer of `$8130F9` bit 1 appears in `src/`** |
| state `$B` -> 2 | `$24681A(($8,A5))`, and `($8,A5)` comes from `$28DE5C jsr $24652A` | **DEV-2**: treated as finished; `$246800` skipped, having nothing to free |
| state 4 -> destroy | `$28E7E6` waits for `$81DFF6`, cleared only at `$28EAD4` inside `$28E7F8` | **NOT FAKED.** Type 6 reaches state 4 and HOLDS, keeping one of the twenty object slots, and says so in `unportedLog` every frame. Everything the stage end has to do has already happened in states 2 and 3 |

Two invented transitions, both required to reach a measurement the brief asks
for; one left broken on purpose because it is not.

## 3. THE MEASUREMENT - `tools/w62stageendgate.mjs`, with a RED control

The PORT replayed from the shipped bundle seed, fire HELD, 21,000 steps,
**port-vs-listing**. No MAME was run: no board trace in this repo has ever
reached the stage-1 boss, let alone timed him out, and the file says so.

```
[M] boss live from lf7871, $22(a5) = $2A2F, 10,799 further decrements
[M] events
      timeout        @lf18669   clk 836
      suspend        @lf19143   clk 836      ($2595E8, 474 frames later)
      stage-advance  @lf19144                ($242952, ONCE)
      bg-destroyed   @lf19145   handle 7     ($25FCFA -> $241238)
      stage-written  @lf19216   1            ($25FD0C)
      rebuilt        @lf19217   handle $B    ($25FD38)
[M] D-script 6 states 0..6  @ 18670 18671 18703 18923 18999 19008 19016
[M] type 6 (object slot 4) states $0 $A $1 $B $2 $3 $4
    @ 19146 19210 19214 19215 19216 19217 19218
[M] the background object LEAVES the table at lf19147 -- ONE FRAME after
    $25FCFA, because $241238 is the DEFERRED list and $241262 drains it at the
    top of the next object-driver pass
[M] $813092 0 -> 1, $813096 0 -> 4, $8130CE 836 -> 0, $813144 $7 -> $B
[M] stops at lf19218: `UNPORTED $228658` -- the NEW background object's first
    frame asks for STAGE 2's column stream, which no wave has ever exported
```

**24 of 24 assertions green.** `--break no-timeout` re-floors `$22(a5)` every
frame so the boss is immortal: **15 of the 24 go RED**, including every one
about the ending. That is the proof the stage measures the ENDING and not the
clock, and it is why this is a gate stage rather than a number in a worklog.

### 3.1 WHAT THE RUN STOPS ON NOW, AND WHY IT IS THE RIGHT WALL

`$228658` is stage 2's column stream, read by the rebuilt background object
through the `$813096` this wave advanced. `SHOT_WINDOWS` has covered
`$225B78 + $22E0` - **stage 1's** 248 columns - since W13, and nothing has ever
needed another stage's. So the first thing the port does in stage 2 is ask for
data no wave has exported, and it says exactly that, by address. Exporting it is
a stage-2 job with its own boot cost and it is deliberately not this wave's.

## 4. RANK - the answer, to I2's standard

**[M] NO RANK WRITE BECAME REACHABLE.** Four addresses, sampled at the boss's
arrival (lf7871) and again after the rebuild, in the same run:

| | at the boss | after the rebuild |
|---|---:|---:|
| `$81309E` rank | 53 | **53** |
| `$81B646` the rank POWER term | 0 | **0** |
| `$81B65C` P1 hyper stock | 0 | **0** |
| `$81B65E` P2 hyper stock | 0 | **0** |
| `$81B64A` the hyper EARN accumulator | 2,112 | **2,112** |

Digit-identical, and `$81B64A`'s 2,112 is **W61 §5's own figure, unmoved**.

**AND THIS WAVE MADE A HYPER-ITEM DROP REACHABLE FOR THE FIRST TIME, which is
exactly the kind of thing the brief says to re-measure.** `$294C50 moveq #$C,D0
/ btst #4,D1 / bne / moveq #$14,D0` - the boss's PART DEATHS drop a **hyper
stock item**, and `$C`/`$14` are precisely the two kinds `src/items.js` REFUSES
at the allocator (W61 §2). So the door W61 bricked up is the door W62 opened,
and the refusal holds: [M] `spawnItem` returns null and counts the refusal with
the stock it did not grant. **On the timeout path the parts die inside
`$294DD4`, which does NOT run `$294C40`'s drop at all** - the drop is on
`$294AD8`'s HP-negative arm, and the timeout kills the parts through
`$294E3E`/`$294E94` directly. So in this run the refusal is not even exercised;
the code path exists, is transcribed, and is named here so that the wave which
makes the boss shootable re-measures it rather than assuming.

`$81309E` **cannot move in this port at all**, whatever this wave did: `$2608D2`
and `$260794` (object type 10, the rank recompute) are still ABSENT from `src/`.
W60 said it, W61 repeated it, and it is still true - a later wave must not read
the row above as a W62 result.

## 5. COVERAGE - branches and table entries, never frames

* **Stage 1's SCRIPT handlers: 19 of 19.** `$292902` was the nineteenth and the
  last; the port has had eighteen since W36. (`$26C20C`, W57's, is a twentieth
  entry against a nineteen-entry denominator - nothing in the script spawns
  type `$1C`.)
* **`$25962E`'s FIVE walks: 5 of 5 transcribed; [M] 2 REACHED** (A3, and A0's
  restart arm through `$2598D0`). A1 and A4 are transcribed and unexercised
  because nothing this port runs starts one; A2 is walked every frame and finds
  seven dormant slots.
* **The A3 table `$29370A`: 10 entries, 3 REGISTERED (4, 5, 6), [M] 3 REACHED.**
  The other seven are the boss's attack scripts and each is a LOUD NAMED THROW
  carrying the address the register held.
* **The A0 table `$293104`: 9 entries, 1 REGISTERED (entry 1, whose init and
  step are the SAME longword), [M] 1 REACHED.**
* **The A4 table `$294F68`: 5 entries, 0 registered.** The window is exported
  anyway, so that starting one names the SCRIPT rather than the table.
* **Object type 6's states: 8 transcribed, [M] 7 REACHED** (0, `$A`, 1, `$B`,
  2, 3, 4). The eighth is `$15`, the ENDING arm, reachable only at
  `($4,A5) == 5`; it is a counted note and recon 49 §8 puts it after stage 5.
* **D-script 6's states: 7 of 7 REACHED.** A3 scripts 4 and 5: 3 of 3 each.
* **`$294AD8`'s three part blocks: 3 of 3 transcribed, [M] 1 REACHED** (part 0's
  no-hit arm). Parts 1 and 2 need the player to shoot them, which needs the
  boss's own scripts.
* **`$242952`'s two entry points: 1 PORTED, 1 NAMED AND NOT PORTED**
  (`$2429C4`, the RESTART, whose one caller `$259DDA` nothing here reaches).
* **Transcribed and unexercised, NAMED:** `$294F50`'s no-live-player re-floor;
  `$294B8E`'s HP-restore arm; both `partDeathDrop`s (and with them the HYPER
  refusal, §4); `$294C74`'s second-item gate; `$25FD8C`; `$25313E`'s pod-respawn
  tail; the A1/A4 walks; `$25962E`'s DOUBLE PASS (five gates, and `$242960`
  disarms it before it could ever pass here).

## 6. WHAT THIS WAVE DID NOT DO

- **THE BOSS.** Recon 48's 111 script entry points, its 257-routine closure and
  its ~31.7 KB are untouched. `src/initbody.js`'s `$2926E2` body still COUNTS
  `$2598E6` and `$25980C` - the two activations - so A2 slot 6 (`$292F4A`, the
  boss's own sprite) and A4 script 0 (`$294FA0`, which starts the whole attack
  sequence 192 frames later) stay dormant. **One** of that body's five notes
  became a real call, `$259554`, and installing a table runs nothing.
  **The boss is on screen as nothing, does not shoot, and cannot be shot.**
- **THE RESULT SCREEN AND THE STAGE-CLEAR SCORE.** §2. So the tally that awards
  the stage-clear bonus through `$28C6C6`/`$28614A`/`$286154` never runs, and
  the score at the end of stage 1 is the score at the boss.
- **STAGE 2.** The rebuilt background asks for `$228658` and stops. No wave has
  exported another stage's map, palette or element table, and doing it is a
  boot-cost decision of its own.
- **Nothing is compared against MAME.** Every dynamic number here is the PORT
  against the shipped seed, or the ROM's own arithmetic. The corpus on disk has
  never run past the boss's arrival, so recon 49 §9's last open item - "record a
  scenario that reaches the timeout and compare `$813092`, `$8130CE` and
  `$813144` across the transition" - is answered on the PORT's side only.
- **`$243DD0`, `$289004`, `$2440E0`, `$246410`, `$28B4BE`, `$242EC2`,
  `$2938AE`, `$23C4D0`, `$253564`, `$242922` and the `$28Cxxx` sounds** are
  counted, not run, each under its own address (`BOSS_NOTED`).
- **`games/gradius/` was not touched.**

## 7. THE PAGE, IN A REAL BROWSER - WHAT I SAW  `[M]`

Chrome + Python `playwright`, W42/W61's recipe, **fire (`z`) HELD from boot for
the whole run**, and the page is READ rather than only photographed: the script
samples the port's own RAM through `window.__mixup.demo.game.ram` every five
seconds. A screenshot can show a picture; only the RAM shows the stage.

### 7.1 LOCAL (`python -m http.server 8712`), `spr 13/13`

```
[M] BOOTED  +0s    lf 2683  clk 171  stage 0  x4 0  $813144=7   $8130F8=0
[M]        +86s    lf 7834  clk 483  ...            <- PAST W57's wall (lf7870)
[M]       +101s    lf 8747  clk 836                 <- the scroll program's END
[M]       +270s    lf18715  clk 836  $8130F8=$C000  <- ****** THE BOSS DIES:
                   $294DD4's bset #6 and bset #7, on the TIMEOUT ******
[M]       +280s    lf19218  clk **0**  stage **1**  x4 **4**  $813144=**$B**
                   $812E06=1
                   *** THE STAGE COUNTER MOVED, THE BACKGROUND WAS REBUILT,
                       AND THE DISTANCE CLOCK IS BACK AT ZERO ***
           then    "$228658 IS NOT PORTED YET" -- stage 2's column stream
```

**280 seconds of continuous play, no throw, no page error, until the frame the
new background object asks for stage 2's map.** Every number matches the
headless gate to the digit, including the stopping frame (lf19218). `rank`,
`rankPower` and the hyper stock read 53/0/0 on EVERY one of the 57 samples.

What is NOT there, and a reader should hear it from me rather than notice it:
**no stage-clear banner, no result screen, no tally.** With the presentation
tier unported the transition is the ship being flung away by `$24A420`'s
constant velocity pair, a beat, and then stage 2's throw. The stage END is
real; the stage-end SCREEN is a wave that has not happened.

Screenshots: `.scratch/w62local-0boot.png`, `.scratch/w62local-STOP.png`.

### 7.2 DEPLOYED - `https://gbtman.pages.dev/games/ddpdoj/`, build `20260805095519`

`node tools/publish.mjs --only ddpdoj`, confirmed live on three consecutive
polls (and the poll log shows the flapping W61 §6b recorded: polls 4 and 7-9
read the new id, 5 and 6 read the old). Then the SAME script, the same key:

```
[M] BOOTED  +0s    lf 2668  clk 170  stage 0  x4 0  $813144=7   spr 13/13
[M]       +278s    lf18955  clk 836  $8130F8=$C000   <- $294DD4's two bsets
[M]       +283s    lf19218  clk **0**  stage **1**  x4 **4**  $813144=**$B**
                   $812E06=1
[M]              then "$228658 IS NOT PORTED YET"
```

**THE SAME LOGIC FRAME AS BOTH LOCAL RUNS AND AS THE HEADLESS GATE - 19,218.**
This is not an E3-class local/deployed gap. `rank`, `rankPower` and the hyper
stock read 53/0/0 on every one of the 57 samples of this run too.

Screenshot `.scratch/w62live-0boot.png`.

**RE-RUN ON THE SETTLED TREE** (after the `$242976` fix of §11.1b, and after the
mutation harness had finished touching `src/`): identical, to the digit -
`+270s lf18770 $8130F8=$C000`, `+280s lf19218 clk 0 stage 1 x4 4 $813144=$B
$812E06=1`, then the same `$228658`. W58 §6's rule applies to browser runs as
much as to gates, and this is the run that is quoted.

## 8. WHAT "VERIFIED" HAS A SHELF LIFE MEANT HERE

The brief's rule: re-measure whatever this work makes reachable for the first
time. Four things changed reachability and each was measured, not assumed:

1. **`$292902` itself.** [M] it now runs 11,348 times in one stage instead of
   throwing on the first.
2. **`$812972`, the GLOBAL FREEZE.** `src/player.js`'s `FROZEN_GLOBALS` has
   listed it since W4 as "seeded and frozen; non-zero jumps the whole update to
   `$24A3A2`", and `$24A3A2` was a THROW. `$242968 move.w #$1,$812972` is the
   fourth instruction of `$242952`, so **W62 is the first wave that could set
   it**, and the path had to be ported in the same wave. It wipes 45 `$30`-byte
   beam segment records at `$811F72` - [M] `src/laser.js`'s own table - which is
   the same class of side effect W61 §5 found in `$25270C`.
3. **The HYPER-ITEM drop at `$294C5A`/`$294C7E`.** §4: W61's refusal covers it,
   and on the timeout path it is not even reached.
4. **Stage 2's data.** The rebuilt background reads through the `$813096` this
   wave advanced, and immediately asks for a window nobody has exported. That is
   a NEW frontier created by this wave and it is named, by address, in §3.1.

## 9. THE FRONTIER THIS WAVE LEAVES

Before W62 the port stopped at **lf 7,870 / clk 488** with `UNPORTED $292902`.
After it, a held-fire run reaches **lf 19,218 / clk 0, IN STAGE 2**, and stops
on `UNPORTED $228658` - stage 2's column stream, a ROM window no wave has ever
had a reason to export. **11,348 logic frames further, and on the other side of
a stage boundary.**

The three things standing between that and a stage 1 that ends *correctly*:

1. **The RESULT SCREEN** (recon 49 §8 wave B): `$28D9AA`, `$28E7F8`, the HUD
   tally, the animation-object subsystem. It removes both of §2's deviations and
   the state-4 hold, and it is where the stage-clear SCORE comes from.
2. **THE BOSS** (recon 48's three waves): 111 script entry points. Until it
   lands, the only way stage 1 ends is the 10,800-frame timeout - the boss is on
   screen as nothing and cannot be shot.
3. **STAGE 2's DATA**, if anyone wants to see what is on the other side.

## 10. A MISTAKE OF MINE, RECORDED

**I COMMITTED A MUTANT.** The savepoint commit `ac5c10c` staged
`games/ddpdoj/src/` by directory while `.scratch/mutate62.mjs` had M9 applied to
`src/scheduler.js` (the A3 walk with `off += 0` instead of `+= 4`, i.e. a slot
that runs its INIT for ever and never its STEP). The harness restores every file
it touches and sha256-verifies it, so the DISK was correct four seconds later -
but the commit is not, and it was pushed.

Corrected by the next commit, and recorded because it is a new instance of a
hazard the HANDOVER already names twice: **`git add <dir>` is `git add -A` with
extra steps**, and the private-index rule does not protect a tree that another
of my own processes is editing. Stage by FILE, and do not commit while a
mutation harness is running.

## 11. EVERY CHECK SEEN TO FAIL - 33 mutants, 33 RED, 0 SURVIVORS

```
[M] 33 of 33 mutants turned a NAMED check RED; survivors 0
    ...and SEVEN of them survived an earlier pass, all seven defective checks
    of mine (11.1 and 11.2) -- one of which HUNG rather than failing.
```


`.scratch/mutate62.mjs`: apply ONE edit with a single-occurrence anchor, run ONE
check, require a NAMED test (or a named gate assertion) RED, restore, **verify
sha256 byte-identical**. `games/ddpdoj/.scratch/` is UNCOMMITTED, so the RESULTS
are here and the machinery is not - a later reader has to rebuild it.

**AND A CORRECTION TO W60/W61's WORDING, because it matters to anyone who
believes it: `games/ddpdoj/.scratch/` IS NOT GITIGNORED.** [M] `git check-ignore
-v games/ddpdoj/.scratch/mutate62.mjs` matches nothing, `.gitignore` has no
`scratch` entry (only `assets/`, `rip/`, `disasm/`, `**/tests/visual/golden/`)
and `.git/info/exclude` holds only `.claude/` paths. It shows up as `??` in
every `git status` and it has stayed out of the repository purely because five
waves in a row stated files BY NAME. That is a convention, not a guard, and the
wave that runs `git add -A` will commit a mutation harness.

### 11.1 ONE OF MY OWN TESTS COULD NOT FAIL - IT HUNG INSTEAD

M9 (the A3 slot that runs its INIT for ever and never its STEP) did not go red
on the first pass. It **hung `node --test` for twenty-five minutes**, because
`state 5 rewrites $A(a4) to $80` was written as `while (state !== 6)` with no
counter, and a slot stuck in state 0 never reaches 6.

**A check that can hang is a check that cannot fail** (`docs/knowledge/03`), and
this one would have sat in the suite indefinitely rather than reporting. Fixed
two ways, because either alone would leave the class open:

* the test is now bounded AND **the bound is asserted** - `assert.equal(n, 347)`,
  so a mutation that changes the cadence is red on the FRAME COUNT and not only
  on the field;
* the harness now runs every check with a 180-second timeout, so a hang is a
  visible failure instead of a silence.

That is the same shape as W57's M3 and W61's M20/M21/M22: a defect in my own
check, found by the mutant it was supposed to catch.

### 11.1b AND RE-READING `$242970` WHILE THE GATE RAN FOUND A REAL DEFECT

Not a mutant - a re-read. `$242976 bmi.b $24298C` jumps to the `bset` when the
player record is **NEGATIVE**, i.e. when bit 15 is SET and the player is LIVE.
I had written it as "bit 15 CLEAR", which sent every live player down the two
`btst`s below instead, and in the shipped seed both of them skip. So
`$242952`'s `bset #$5` on `$8103E6` and `$810448` was **not happening at all**,
on the very path this wave exists to make run.

Found by reading the four instructions again after the code was written,
measured, gated and committed - `docs/knowledge/02`'s rule pointed at a BRANCH
SENSE instead of a routine end. Three new mutants (M31/M32/M33, one per test in
the chain) and a four-case unit test now hold it: LIVE always bsets;
not-live-and-bit-0-clear skips; not-live-and-low-byte-bit-7-set skips; and the
fall-through bsets.

### 11.2 THREE MUTANTS SURVIVED THE SECOND PASS, AND ALL THREE WERE MY GATE'S FAULT

| mutant | what it broke | why it survived | the check that now exists |
|---|---|---|---|
| **M28** | `$24A3A2`'s `bset.b #$2,$1(A6)` latch - so the 45-record BEAM WIPE at `$811F72` ran on every frame of the stage clear instead of once | nothing counted the wipe. A `bset` used as a once-only latch is invisible in the state it leaves behind | `src/player.js` now emits `player-beam-wipe` at the instruction, and the gate asserts it happens **exactly once** |
| **M29** | `$24A3F0 cmp.w $813092,D0` read as stage **1** instead of stage 4 | **UNOBSERVABLE, and that is a FINDING.** `$813092` is 0 for the whole clearing window - `$812972` goes up at lf19144 and `$25FD0C` does not write the stage until lf19216 - so on stage 1 neither `#$4` nor `#$1` can ever match. Re-cut as `=== 0`, which IS observable, and it then went red on a new assertion for `$24A420`'s constant pair `($C00, $E00)` |
| **M30** | `$29291E bcc` read as `bcs` - the stage advance firing on every frame the boss is NOT suspended | the gate CRASHED (`ledgerAtBoss` was null, because `$292928` frees the boss on its first frame and the pre-step scan never saw it) and a crash is not a NAMED red | a `the boss record is SEEN AT ALL` assertion, and the ledger block no longer dereferences a null |

`.scratch/mutate62.mjs` also gained a 180-second per-check timeout, so a hang is
a visible failure rather than a silence.

**AND FOUR MORE ANCHORS FAILED TO MATCH AT ALL** (`ANCHOR NOT UNIQUE (0)`)
because a patch script of mine had rewritten `src/scheduler.js` and
`src/stageend.js` with **CRLF** line endings while the repository's are LF.
That is the third time this session; `HANDOVER` §10's `git diff
--ignore-cr-at-eol` is the one-command test for it, and the fix is
`open(p, 'w', newline='')` - or not using Python to edit JS at all.

## 12. THE BOOT COST - five ROM windows, 384 raw bytes, and every byte named

`.scratch/w62boot.mjs`, W61 §6's method: re-export with the PRE-W62 exporter
(`git show cefa567:`) and with this tree's, both sha256'd byte-identical on the
way back.

```
[M] manifest.json            10,776 ->  10,776      +0   (no new shard)
[M] player.tables.json.gz   138,932 -> 139,651    +719
[M] spr/streams.u32.gz        1,055 ->   1,055      +0
[M] seed.bin.gz               6,878 ->   6,878      +0
[M] capture.json.gz           3,920 ->   3,920      +0
[M] TOTAL                   161,561 -> 162,280    +719 B = 0.70 KiB
```

**+719 B, all of it in `player.tables.json.gz`, and it is the FIVE ROM WINDOWS**
- 384 raw cartridge bytes, hex-encoded at two characters a byte before gzip.
**They cannot be deferred**: a missing sprite stream is a NAMED SKIP the page
draws around, but a missing ROM window is a THROW out of `src/rom.js`, which is
the whole reason `RomWindows` exists (W54 §3, W61 §6).

**No new sprite shard**, so `manifest.json` - the one body served uncompressed -
does not move at all. This is the cheapest wave for boot since W47.

## 13. THE DONE-WHEN, EACH AS A MEASUREMENT

| the brief asks for | `[M]` |
|---|---|
| **Stage 1 ends. Say what happens, with the logic frame. Does the background tear down and rebuild? Does the stage counter advance?** | §3 and §7: **YES, at logic frame 19,217.** `$25FCFA` queues the background object (`$813144 = 7`) on the DEFERRED kill list at lf19145 and it leaves the object table at lf19147; `$25FD0C` writes `$813092` **0 -> 1** and `$813096` **0 -> 4** at lf19216; `$25FD38` builds a NEW type-1 object at lf19217 with `$813144 = $B` and entry clock 0, and the distance clock reads **0**. Seen in Chrome as well as headless, at the same frame |
| **whether it ends via the timeout, via a boss kill, or both - and which paths remain throws** | **VIA THE TIMEOUT, and only via the timeout.** `$294F32` spends 10,799 further decrements of `$22(a5)` and expires at lf18669; the HP arm `$294BA4` never fires because nothing can damage the boss - the boss's own scripts are dormant (§6) and its sprite is never drawn. Seven of the ten A3 scripts, all five A4 scripts and eight of the nine A0 entries remain **LOUD NAMED THROWS**, as does everything past the rebuild (`$228658`, stage 2's map) |
| **Say what you SAW in the browser. LIVE deployed URL as well as local** | §7 |
| **Rank: state explicitly whether any rank write became reachable** | §4: **NO.** `$81309E` 53, `$81B646` 0, `$81B65C` 0, `$81B65E` 0 - digit-identical at the boss's arrival and after the rebuild, and `$81B64A` is 2,112 on both, unmoved from W61's figure. The one newly-reachable rank-adjacent path - the boss's part deaths dropping a HYPER STOCK item at `$294C5A` - is covered by W61's refusal AND is not reached on the timeout path at all |
| **If you allocate from any pool, prove it drains** | Two allocations, both from the OBJECT table (`$241182`), both single: object type 6 at lf19144 and the new background at lf19217. [M] the object table holds 8 records before the advance and 9 after, and `$25FCFA`'s kill drains through `$241262` one frame later - measured as `bg object absent from lf19147`. **AND ONE DOES NOT DRAIN, DECLARED: the type-6 object holds state 4 for ever** (§2), because `$28E7F8` is not ported. That is one of twenty object slots, permanently, and it is named rather than hidden |
| **Gate ALL GREEN, 767 unit tests** | §15 |

## 14. WHAT I COULD NOT DETERMINE

* **Anything against the board.** No MAME was run this session. Every dynamic
  number above is the PORT against the shipped seed, or the ROM's own
  arithmetic. Recon 49 §9's last open item asks the first wave that ports this
  to "record a scenario that reaches the timeout and compare `$813092`,
  `$8130CE` and `$813144` across the transition" - this wave answers it on the
  port's side only, and that half is `tools/w62stageendgate.mjs`.
* **What the stage end LOOKS like.** With the presentation tier unported there
  is no `STAGE CLEAR` banner, no result screen and no tally; what a player sees
  is the ship flung away by `$24A420`'s constant velocity pair and then the
  stage-2 throw. The picture is compared against nothing.
* **`$28E7F8`'s banner** (299 instructions), whose `$28EAD4 clr.w $81DFF6` is
  the only writer that could let object type 6 leave state 4. §2.
* **Whether `$242952`'s `bset #$5` on the two player records has a CONSUMER
  this port can see.** §11.1b fixed the instruction; nothing in the gate or the
  browser run moved as a result, so what bit 5 of `$8103E6` is FOR is
  transcribed and unmeasured. (It is not `$249512 bclr #5`, which is the same
  bit on the same byte and runs every frame of a NON-frozen player - so on the
  stage-clear path, where `$249508` diverts before it, the bit survives.)
* **`$81DFFC..$81E023`**, the five per-stage byte lists `$28ECB2` indexes by
  `$813096`. They are RAM, they are ZERO in the shipped seed, and **I did not
  find their writer** - so `$28ECCE` picks art entry [0] every time and whether
  that is what the board does is unmeasured. What I tried: `xref.py abs` on all
  five bases, and reading `$28D566`/`$28EC86`/`$28E7A2`'s clears.
* **`$2938AE` and `$2938F2`**, the boss-local emitters D-script 6 and the two
  part scripts call. Counted, never read past their first instruction.
* **Whether the three A0 sequencer entries beyond [1] are ever reached**, and
  what `$81298C`'s sixteen-word parameter block means. `$259734`'s copy is
  transcribed; nothing this port runs reads the result.
* **The `$2429C4` variant's caller `$259DDA`.** Recon 49 §9 opened it and this
  wave classified `$2429C4` itself from the listing (§1, ADVANCE_ENTRIES) but
  did NOT read `$259DDA`.

## 15. THE GATE, ON THE SETTLED TREE

W58 §6's rule, and this wave broke it twice before honouring it: **a gate
started before the tree settled is not evidence about the tree.** The first
`pgm.py check` of this session ran while `.scratch/mutate62.mjs` was editing
`src/`; the second ran while I was still reading `$242970`. Both were killed and
neither is quoted. The run below is the third, on a tree nothing was editing.

## 16. ONE PARAGRAPH

**Stage 1 ends.** The boss arrives at logic frame 7,870 - where the port has
stopped since W57 - and does nothing for 10,800 frames, because that is what
`$22(a5) = $2A30` from his own record prototype buys him. At lf18,669
`$294F3C` spends the last one, `$294DD4` kills him, and 474 frames of death
animation later `$293E16 jsr $2595E8` sets `$812E06`. On the next frame
`$25962E` returns carry set for the first time in the port's life, `$292922 jsr
$242952` runs exactly once, and object type 6 - the machine all five stages
advance through - destroys the background object, writes `$813092 := 1` and
builds a new background with entry clock zero. **Logic frame 19,217, and you
can watch it happen in Chrome.** What it does not do is end *correctly*: the
result screen is 819 instructions this wave did not port, two of type 6's state
exits are declared deviations standing in for it, a third is left broken on
purpose, and the boss is still a thing that cannot be shot.

```
python games/ddpdoj/tools/oracle/pgm.py check
VERDICT: ALL GREEN -- 53 passed, 0 failed, 0 SKIPPED
  [PASS] STAGE 1 ENDS: the boss timeout, $242952, and the rebuild
  [PASS] STAGE 1 ENDS RED [no-timeout] -- went red without the timeout, as it must
```

**51 -> 53 stages, and the two new ones are this wave's scenario and its RED.**
Nothing was disabled, skipped, narrowed or loosened, and every stage line was
read rather than only the verdict. The ones this wave could plausibly have
broken, all green:

- **`fly-around: port vs board, 0 divergent frames` and its 5 REDs** - the only
  port-vs-board window this project has. Nothing fires in it, so the boss is
  never reached and none of W62's code runs; its green says this wave changed
  nothing on the no-input path.
- `display list: the staged-bytes replay gate (1,901 frames)` and its 12 REDs.
- `midboss DEATH` and its `RED [no-kill]` - W57's, untouched.
- `assets/integrity` and its four REDs, including `[rom-byte]`, THE ROM-LEAK
  GUARD: five new ROM windows went through it.
- `background shard gate` - the stage that FRESH-EXPORTS, i.e. the one an
  exporter change has to survive.
- `pixel gate` (100.0000 %) and its 9 REDs; `demo gate` and its 4.

Also green on the final tree, and not part of `pgm.py check`:

```
node --test games/ddpdoj/tests/     808 pass, 0 fail, 0 SKIPPED   (was 767)
node games/ddpdoj/tools/webgate.mjs 14 of 14 PASS                 (unmoved)
node tools/build-dist.mjs           clean, 5 deliberate exception(s)  <- UNMOVED
```

**`PUBLISH_VERBATIM` DID NOT GROW**: this wave ships no new asset body at all,
only 384 bytes of ROM windows inside `player.tables.json.gz`.


**[M] THE SERVER I STARTED WAS KILLED.** `Get-CimInstance Win32_Process` finds
ZERO `http.server`/`serve.py` processes and ports 8000/8712/8771/8781/8791/8125
are all FREE -- checked by PROCESS and by PORT, as W61 §6b did.

status: **DONE**
