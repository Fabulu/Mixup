# W62 IMPL — S1: MAKE STAGE 1 END

status: **IN PROGRESS**

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

### 1.1 THE BRIEF'S PREMISE, CHECKED — recon 49 reproduces, with FIVE corrections

Every address, table and census in recon 49 §1–§3 was re-read out of
`out/maincpu.bin` this session and reproduces **exactly**: the freeze word gates
only `$26132C`; `$261138` has no caller; `$242952`'s twenty-five instructions;
`$25FD0C`'s three writes; `$25FD24`'s 22 words; `$25FD38`'s eight resets and its
`($6,A0) := 0`; `$2927F6`'s eight words with `$2A30` seventh; `$294F32`'s
thirteen; `$285496` as the ONE `bset` of `$8130F9` bit 1.

| the recon said | `[M]` this session |
|---|---|
| §3.1 LINK 2: "D script 6 … `#$20,$A(a4)`… **32 frames**" | **474.** `$293DC6` leaves `$2(a4) = 0`, so the state-6 arm is not taken on the arming frame; `$A(a4)` is rewritten to `$80` at `$2940FA` and again at `$293EF2`. State 6 waits **128** frames and it is the LAST of seven. |
| §3.2 the chain: `$294DD4 -> D.start 6` | `$294DD4` starts **THREE** A3 scripts — `$294E88` (4) and `$294EDE` (5) through the two part-death arms, then `$294E34` (6) — and `$294E2C` starts A0 sequencer script 1 as well. A port that registered only D-script 6 stops on the frame the boss dies. |
| §5.2 "BOSS-SIDE TRIGGER 4 routines ~40 insn" | The trigger cannot skip `$294AD8`: `$294F32`'s **only** entry is `$294DCC jmp $294F32(pc)`, the fall-through at the end of the damage pass. The real trigger is ~200 + 25 + 13 + 187 + the scheduler. |
| §5.3 "a **documented, cited** short-circuit that sets `$8130F9` bit 1" (ONE) | **TWO.** `$28D6FC`'s `$24681A(($8,A5))` gate is the second, because `($8,A5)` is written by the same unported `$28DE5C`. A third exit (`$28E7E6`/`$81DFF6`) is left UNSATISFIED rather than faked. |
| §9 "`$28ECCE`'s exit condition … I did not walk it" | Determined. `$28EC86` — called from `$28D566`, sixteen instructions before `$25FCFA` — seeds `$81E026 := $707`, `$81E028 := 7`, `$81E02A := 4`, and `$28ECCE` then returns C=1 for **63** calls and C=0 on the 64th. |

### 1.2 READ PAST THE APPARENT END — three places, and one is the biggest trap here

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

**THE PRESENTATION TIER IS NOT PORTED** — `$28D9AA` (819 instructions),
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

## 3. THE MEASUREMENT — `tools/w62stageendgate.mjs`, with a RED control

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
`$225B78 + $22E0` — **stage 1's** 248 columns — since W13, and nothing has ever
needed another stage's. So the first thing the port does in stage 2 is ask for
data no wave has exported, and it says exactly that, by address. Exporting it is
a stage-2 job with its own boot cost and it is deliberately not this wave's.

## 4. RANK — the answer, to I2's standard

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
/ btst #4,D1 / bne / moveq #$14,D0` — the boss's PART DEATHS drop a **hyper
stock item**, and `$C`/`$14` are precisely the two kinds `src/items.js` REFUSES
at the allocator (W61 §2). So the door W61 bricked up is the door W62 opened,
and the refusal holds: [M] `spawnItem` returns null and counts the refusal with
the stock it did not grant. **On the timeout path the parts die inside
`$294DD4`, which does NOT run `$294C40`'s drop at all** — the drop is on
`$294AD8`'s HP-negative arm, and the timeout kills the parts through
`$294E3E`/`$294E94` directly. So in this run the refusal is not even exercised;
the code path exists, is transcribed, and is named here so that the wave which
makes the boss shootable re-measures it rather than assuming.

`$81309E` **cannot move in this port at all**, whatever this wave did: `$2608D2`
and `$260794` (object type 10, the rank recompute) are still ABSENT from `src/`.
W60 said it, W61 repeated it, and it is still true — a later wave must not read
the row above as a W62 result.

## 5. COVERAGE — branches and table entries, never frames

* **Stage 1's SCRIPT handlers: 19 of 19.** `$292902` was the nineteenth and the
  last; the port has had eighteen since W36. (`$26C20C`, W57's, is a twentieth
  entry against a nineteen-entry denominator — nothing in the script spawns
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
  `$2598E6` and `$25980C` — the two activations — so A2 slot 6 (`$292F4A`, the
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
  never run past the boss's arrival, so recon 49 §9's last open item — "record a
  scenario that reaches the timeout and compare `$813092`, `$8130CE` and
  `$813144` across the transition" — is answered on the PORT's side only.
- **`$243DD0`, `$289004`, `$2440E0`, `$246410`, `$28B4BE`, `$242EC2`,
  `$2938AE`, `$23C4D0`, `$253564`, `$242922` and the `$28Cxxx` sounds** are
  counted, not run, each under its own address (`BOSS_NOTED`).
- **`games/gradius/` was not touched.**

## 7. THE PAGE, IN A REAL BROWSER — WHAT I SAW  `[M]`

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
`rankPower` and the hyper stock read 53/0/0 on EVERY sample of the run.

Screenshots: `.scratch/w62local-0boot.png`, `.scratch/w62local-STOP.png`.

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
   beam segment records at `$811F72` — [M] `src/laser.js`'s own table — which is
   the same class of side effect W61 §5 found in `$25270C`.
3. **The HYPER-ITEM drop at `$294C5A`/`$294C7E`.** §4: W61's refusal covers it,
   and on the timeout path it is not even reached.
4. **Stage 2's data.** The rebuilt background reads through the `$813096` this
   wave advanced, and immediately asks for a window nobody has exported. That is
   a NEW frontier created by this wave and it is named, by address, in §3.1.

## 9. THE FRONTIER THIS WAVE LEAVES

Before W62 the port stopped at **lf 7,870 / clk 488** with `UNPORTED $292902`.
After it, a held-fire run reaches **lf 19,218 / clk 0, IN STAGE 2**, and stops
on `UNPORTED $228658` — stage 2's column stream, a ROM window no wave has ever
had a reason to export. **11,348 logic frames further, and on the other side of
a stage boundary.**

The three things standing between that and a stage 1 that ends *correctly*:

1. **The RESULT SCREEN** (recon 49 §8 wave B): `$28D9AA`, `$28E7F8`, the HUD
   tally, the animation-object subsystem. It removes both of §2's deviations and
   the state-4 hold, and it is where the stage-clear SCORE comes from.
2. **THE BOSS** (recon 48's three waves): 111 script entry points. Until it
   lands, the only way stage 1 ends is the 10,800-frame timeout — the boss is on
   screen as nothing and cannot be shot.
3. **STAGE 2's DATA**, if anyone wants to see what is on the other side.
