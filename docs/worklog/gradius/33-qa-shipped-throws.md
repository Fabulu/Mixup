# W33 - QA: the shipped throws

status: DONE
reviewer, READ-ONLY on `games/gradius/src/` and `games/gradius/tests/`. No commit.

Triggered by W32c's discovery of `$BC44` - a loud throw bounded at `$19 >= 2`,
found at frame 190 of the first real stage-5 run, while `stageledger.py` had
printed stages 3 and 4 RUNNABLE since W30/W31 and both were live.

Every number below was measured THIS SESSION unless it says otherwise. Where a
figure comes from another document it says so.

---

## HEADLINE

**FIVE more shipped crashes besides `$BC44`, in three classes.** All five are
reachable in stages the ledger prints RUNNABLE. Three of them were reproduced by
driving `nmi()` with **no interventions at all** - no forced status, no shield,
no forced input.

| # | what | stages | first seen | class |
|---|---|---|---|---|
| 1 | `$B415 LDA $B42F,Y` runs off a 5-entry table | 3 and 4 (`$19` 2, 3) | **frame 314, passive, no input** | table overrun, NOT a named throw |
| 2 | `$C2DC` a shot hits a BREAKABLE wall | 2 (`$19`=1) | frame 130 (6 of 8 chunks) | unported ROM branch |
| 3 | `$C13D` a type `$27` object touches the ship | 1, 2, 3, 4 | frame 414, stage 1, **ship never moved** | unported ROM branch |
| 4 | `$C159` a type `$29` object touches the ship | 1, 2, 3, 4 | direct repro | unported ROM branch |
| 5 | `$CC7C/$CC85 LDA $CC23,Y` runs off an 8-entry table | 5 (`$19`=4) | frame 1173 | table overrun, NOT a named throw |

and one already-documented boundary that is nonetheless a crash a real player
reaches on **every** stage: `$9751`, the game-over restart-to-title (reproduced
passively at frames 1295–1381 on stage 4).

**The single most severe is #1**: stages 3 and 4 crash **on their own**, from
chunk 0, at frame 314, with the player pressing nothing. `test-all.mjs` is
GREEN, the ledger prints RUNNABLE for both, and neither is a lie about coverage
- they are lies about a thing neither instrument measures.

---

## §1. METHOD, AND WHAT WAS MEASURED

`python games/gradius/tools/oracle/stageledger.py`, run first, unmodified tree:

```
PER-STAGE RUNNABILITY  (NOT record coverage -- see W31)
stage  $A2F0 runEngine        late spawner jt_$C439[$19]   verdict
0      admitted               $C486 +$B36F ported          RUNNABLE
1      admitted               $C546 +$B37F ported          RUNNABLE
2      admitted               $C686 ported                 RUNNABLE
3      admitted               $C5AD +$B377 ported          RUNNABLE
4      admitted               $C653 ported                 RUNNABLE
5      THROWS (scope guard)   $C6DE THROWS                 blocked
6      THROWS (scope guard)   $C429 ported                 blocked
```

So `$19` = 0..4 (stages 1–5) is the "shipped" set, and the port boots to stage 1
mode 5 and reaches stages 2–5 by ordinary play: `$9904` (`$1B` = `$86`) sets
`$1B := $90`, `$96CF nextStage` INCs `$19`. There is no stage picker in
`games/gradius/index.html` - I looked; the "level picker" of commit c51512a is
Batman's launcher, not this game. **Stages 2–5 are reached by playing, which is
what makes them shipped.**

`python games/gradius/tools/oracle/throwinventory.py` (run from
`games/gradius/`), this session:

```
throw new Error() sites: 78
  carrying >=1 ROM address        : 64
  no ROM address (invariant/assert): 14
  distinct ROM addresses named    : 124
```

I read all 78 with 18 lines of context each and classified every one by its
guard. The classification is §2. Then I drove `nmi()` over **every chunk of
every RUNNABLE stage** (36 chunk runs × 1400 frames) and recorded the first
throw; that is §3 and it is what found #1 and #5, neither of which any reading
of the throw list would have produced.

Harnesses live in the scratchpad (`repro.mjs`, `e2e.mjs`, `sweep.mjs`,
`probe.mjs`, `cc34.mjs`, `cc34b.mjs`) and import the port by absolute `file:`
URL. **Nothing in the tree was written except this file.**

---

## §2. THE LOUD-THROW CENSUS - all 64 address-carrying sites, by guard

Grouped by whether a stage the ledger calls RUNNABLE can reach them.

### 2a. REACHABLE IN A RUNNABLE STAGE - the shipped crashes

| file:line | ROM | guard | stages that can reach it |
|---|---|---|---|
| `collision.js:1093` | `$C2DC` | terrain cell field == 2 | **`$19`=1** (and 5,6 - blocked) |
| `collision.js:781` | `$C13D` | enemy type `$27` overlaps the ship | **`$19`=0,1,2,3** |
| `collision.js:787` | `$C159` | enemy type `$29` overlaps the ship | **`$19`=0,1,2,3** |
| `nmi.js:918` | `$9751` | game over + continue window expired | **every stage** |
| `nmi.js:891` | `$970D` | START on the game-over screen | **every stage** |
| `nmi.js:909` | `$9721` | `$33` reached `$0A` (continue cheat) | every stage, needs the code |
| `flow.js:634` | `$9B10` | pause + `$33` == `$0A` | every stage, needs the code |
| `enemies.js:3016` | `$C85D` | moai `STA ($9A),Y` leaves `$0500-$06FF` | **`$19`=2** (45 type-`$16` records) - tripwire, not reached in my sweep |

Full detail on the first three in §4.

`$970D`/`$9721`/`$9B10`/`$9751` are the documented "modes 0–4 are out of scope"
boundary (HANDOVER §2: no title screen). I am listing them anyway because
**`$9751` is not hypothetical** - my passive stage-4 runs hit it at frames
1295–1381 on five of seven chunks, and W32c hit it at f2829. Any player who runs
out of lives, on any stage, gets a crash instead of a title screen. That is a
decision the owner has taken, not a defect; it is here so nobody re-derives it
as one, and so the count of "crashes a player can reach" is honest.

### 2b. GATED TO A BLOCKED STAGE - correct, and consistent with the ledger

| file:line | ROM | guard |
|---|---|---|
| `enemies.js:391` | `$A2F0` | `$19 >= 5` - the scope guard itself |
| `enemies.js:501` | `$C6DE` | `jt_$C439[5]`, stage 6's late spawner |
| `nmi.js:575` | `$99C4` | `$19 >= 5` |
| `nmi.js:510` | `$9A12` | `$19 == 6` |
| `nmi.js:703` | `$9872` | `$19 == 6` (the ending) |
| `nmi.js:708` | `$9911` | `$19 == 5` |
| `collision.js:524` | `$C099` | enemy type `$9A` - **type `$1A` appears only in `$19`=5** (51 records), whose handler entry 26 `$B480` throws anyway |
| `enemies.js:1841` | `$AE1C` default | `handlerclosure.py` this session: stages 0–4 need 16/14/14/18/7 entries and **all are ported**; only `$19`=5 (entry 26) and `$19`=6 (entries 30, 32–37) miss |

### 2c. NOT REACHABLE IN PLAY MODE - checked, with the reason

* `nmi.js:433,439,443,447,451,454,457` - `jt_$982F` arms 7–13 (`$1B` = `$87`..`$8D`).
  I scanned every `$1B` writer in the PRG this session: 8 immediate stores
  (`$8165` 0, `$97FD` `$C0`, `$986B` `$90`, `$98E7` 0, `$9943` `$8E`, `$99CF`
  `$86`, `$9C40` `$80`, `$C1F1` `$A0`), 12 `INC $1B`, 3 indirect. The only way
  into `$87` is `$9872 INC $1B` from `$86`, which is gated `$19 == 6`. So the
  whole `$87`–`$8D` chain is stage-7/ending-only. **Not verified dynamically** -
  see §7.
* `nmi.js:272` - `$80D1`, game mode != 5. The port boots to mode 5 and nothing
  in `src/` writes `state.mode`. Confirmed by grep.
* `collision.js:1050` - `$C3AD`, needs player X == 0; the `$A03A` clamp is
  [16,240].
* `collision.js:994` - `$C22F`, needs an enemy-bullet box class > 2. I scanned
  every store into `$0160-$017F` in the PRG (22 sites; 6 reach `$0176`) and the
  largest value any of them can write is **2** (`$BACC LDA #$02`). So `k > 2` is
  unreachable, and the comment's "reaching this needs `$B3B6`/`$B4A2`" is now
  imprecise rather than wrong - `$BACC` writes 2 and 2 does not throw.
* `enemies.js:2241` - `$B1C5`, guarded five-entry overrun. **This one HAS a
  named throw**, and that is the whole point of §5.
* `hud.js:114`, `flow.js:80`, `powerup.js:127`, `weapons.js:109`,
  `player.js:121` - `$18 != 0`, two-player. Nothing selects it.
* `powerup.js:167` (`$8984`), `flow.js:112` (`$96C2`), `enemies.js:1786`
  (`$AE1C` bounds), `enemies.js:1762` (`$ADC1`), `hud.js:169` (`$88E5`),
  `vram.js:100/157/161`, `hudpackets.js:88/98`, `sound.js:144/179/188/219`,
  `apu.js:454/568/595/607` - invariants and asset guards; they fire only if the
  port or the export is already broken.
* the ten loop-count assertions (`$BFE2` 9, `$C00B` 10, `$BEF3` 4, `$C101` 10,
  `$C20A` 10, `$C2C4` 6, `$C2FF` 10, `$BC19` 10, `$ADAB` 10, `$A108`, `$A16F` 3,
  `$A1E6` 6) - same.
* `enemies.js:3778/3790` - boss object-address guards.
* `oam.js:224` - `$8BD9` with `rom === null`: an API-misuse guard, not a ROM gap.

---

## §3. THE SWEEP - 36 chunk runs, every RUNNABLE stage

`nmi()` driven 1400 frames per chunk, camera stepped 2 px/frame, fire held.
INTERVENTIONS, labelled per `docs/knowledge/09`: `status[0]` forced to 1 and the
shield held at `$FF`. **Every finding below was then re-run with all three
interventions removed**, and the ones that survived that are marked PASSIVE.

```
stage $19=0 chunk  5 : THROW @f 414  $C13D: enemy type $27 touched the ship
stage $19=1 chunk  0 : THROW @f 536  $C2DC: shot slot 6 hit a BREAKABLE wall
stage $19=1 chunk  1 : THROW @f 343  $C2DC
stage $19=1 chunk  2 : THROW @f 130  $C2DC
stage $19=1 chunk  3 : THROW @f 298  $C2DC
stage $19=1 chunk  4 : THROW @f 130  $C2DC
stage $19=1 chunk  5 : THROW @f 164  $C2DC
stage $19=2 chunk  0 : THROW @f 311  $B434 is not in any exported range
stage $19=3 chunk  0 : THROW @f 311  $B434 is not in any exported range
stage $19=3 chunk  5 : THROW @f 462  $C13D
stage $19=4 chunk  6 : THROW @f1175  $CC34 is not in any exported range
                       (26 of 36 chunk runs clean for 1400 frames)
```

first-throw tally: none 26, `$C2DC` 6, `$C13D` 2, `$B434` 2, `$CC34` 1.

PASSIVE re-runs (no forced status, no shield, no input at all):

```
stage $19=2 chunk 0 : THROW @f314  $B434    <- PASSIVE
stage $19=3 chunk 0 : THROW @f314  $B434    <- PASSIVE
stage $19=3 chunks 2,3,4,5,6 : THROW @f1295..1381  $9751 game over  <- PASSIVE
stage $19=4 all chunks       : clean 1400   (so $CC34 needs the shield state)
```

---

## §4. THE THREE UNPORTED BRANCHES, AND WHY THE ROM SAYS THEY ARE REACHABLE

### 4a. `$C2DC` - the breakable wall. STAGE 2's ENTIRE SIGNATURE MECHANIC.

`terrainPart` runs `shotsVsTerrain` on every stage but `$19`=4 (and on `$19`=2
only on odd frames). `$C2D8 CMP #$02` splits a solid cell from a BREAKABLE one,
and the breakable arm - `$C32F`'s VRAM patch, `$C34C`'s queue append and the
`$0500` map update - is unported and throws.

Counted this session out of `assets/terrain/stages.json`, over the blocks each
stage's `pageOrder`/`screens` actually place (not the whole block dictionary):

| `$19` | blocks in use | 2-bit collision fields 0 / 1 / 2 | blocks holding a field-2 cell |
|---|---|---|---|
| 0 | 40 | 337 / 303 / **0** | 0 |
| 1 | 83 | 708 / 393 / **227** | **42** |
| 2 | 32 | 406 / 106 / 0 | 0 |
| 3 | 43 | 458 / 230 / 0 | 0 |
| 4 | - | `collisionWritten` false, no map | - |
| 5 | 118 | 944 / 473 / **471** | 51 |
| 6 | 102 | 745 / 887 / 0 | 0 |

**Stage 2 (`$19`=1) carries 227 breakable cells across 42 of its 83 placed
blocks.** Every one of them throws the first time any of the six shot/missile
slots probes it. Reproduced end-to-end on 6 of stage 2's 8 chunks; the earliest
is **frame 130**, about 2.2 seconds after entering the chunk.

Two negative controls, both green: the same shot over a field-1 (solid) cell
does not throw, and stage 1's map contains no field-2 cell at all - which is
exactly why this survived every stage-1 measurement ever made here.

### 4b/4c. `$C13D` and `$C159` - types `$27` and `$29`

Read out of `assets/prg.bin` this session with `wavecensus.stream()`, per stage,
by distinct record address:

```
type $27 records:  $19=0 chunks 5,6,7 @$A8F5 trig $34   (x=$F0 y=$60)
                   $19=1 chunk 4      @$A9B9 trig $F8   (x=$F0 y=$84)
                   $19=2 chunk 4      @$AAAD trig $D0   (x=$F0 y=$3A)
                   $19=3 chunks 5,6   @$ABA3 trig $40   (x=$F0 y=$60)
                   $19=5 chunks 5,6   @$ACBA trig $01
type $29 records:  $19=0 chunk 2      @$A8A0 trig $F8   (x=$F0 y=$A4)
                   $19=1 chunk 2      @$A96D trig $F8   (x=$F0 y=$BD)
                   $19=2 chunk 3      @$AA5A trig $68   (x=$F0 y=$BA)
                   $19=3 chunks 2,3   @$AB3A/$AB63      (x=$F0 y=$24)
```

Both types dispatch to entry 39 / 41 = `$AEDD`, **which is ported**, so the port
spawns them, moves them and draws them. `contact()` (`$C16E`) then tests
`CMP #$27` and `CMP #$29` **before** the `>= 3` arm, before the armed-enemy
path and before the shield - so no power-up state avoids it.

Reproduced end-to-end on stage 1 chunk 5: the ship was left where `bootState`
puts it and **never moved**; the `$27` flew into it and the port threw at
**frame 414**. Also at frame 462 on stage 4 chunk 5. Chasing the object drops it
to frame 5.

`$C159` I could NOT reach in a driven run: 900 frames from stage 1 chunk 2 with
the chaser on never spawned a type `$29` (types seen: `$2 $4 $7 $8 $A $13`). I
did not chase it further. What I have is the ROM record above plus a direct
reproduction of the throw with a type-`$29` object placed on the ship. So:
**`$C159` is proven to throw on contact and its record is proven to exist in
four RUNNABLE stages; I did not witness the spawn.**

The throw messages on both say *"no measured run has spawned type `$27`/`$29`"*.
That sentence is true and it is the project's oldest mistake in the exact form
`docs/knowledge/09` names: a fact about the corpus, read back as a claim about
the cartridge. The ROM listed both records on day one.

---

## §5. THE NEW CLASS: UNGUARDED TABLE OVERRUNS IN PORTED HANDLERS

This is not the `$BC44` class. `$BC44` was an unported branch. **These are
ported branches indexing a table past its end**, and they do not produce a named
throw at all - they surface as `src/assets.js:153`:

> `enemy tables: $B434 is not in any exported range (…). Either the port indexed
> a table out of bounds or export_assets.py needs to export the range.`

A player's crash report reads as an ASSET problem. The suggested fix in the
message - export the range - is the wrong one: it would turn a loud crash into
the port silently reading an opcode byte as data.

### 5a. `$B415 LDA $B42F,Y` - stages 3 and 4, frame 314, PASSIVE

`h_B402` (entry 13, types `$0D`/`$8D`). `$B426 INC $04AC,X` advances an arc
counter with no bound; `$B415 LDA $B42F,Y` indexes a **5-byte** table
(`$B42F-$B433`; `$B434` is `sub_B434`'s own `BD` = `LDA $030C,X` opcode).

Measured: `$04AC` reaches **5** and the read is attempted. Reproduced on
`$19`=2 chunk 0 and `$19`=3 chunk 0, at **frame 311 with fire held, frame 314
with no input, no forced status and no shield** - deterministic, and the only
two chunks of those two stages that carry a type-`$0D` record.

This is the identical shape to `$B1C5 LDA $B200,Y`, which the port DOES guard
with a named throw and a 27,400-frame cartridge measurement behind it
(`enemies.js:2241`, quoted from W12 - not my number). Entry 14 `$B434`'s twin
table `$B45C-$B460` is the same 5 bytes and has the same missing guard.

**UNRESOLVED, and it matters which:** either the port's transcription of
`$B402`/`$B212` lets the enemy live one arc longer than the cartridge's (in
which case it is a movement bug), or the cartridge really does read `$B434`. The
measurement that settles it is the one `$B1C5` already has - an exec hook on
`$B415` reading Y. I did not have an emulator run in this session and I am not
guessing.

### 5b. `$CC7C/$CC85 LDA $CC23,Y / LDA $CC2B,Y` - stage 5, frame 1173

`sub_CC33` computes `$CC50 LDA $0460,Y / ASL / ASL / CLC / ADC $0601,X`, i.e.
`z9A = (boxClass[owner] << 2) + shape`, then indexes two **8-byte** tables
(`$CC23-$CC2A`, `$CC2B-$CC32`; `$CC33` is `sub_CC33`'s own first byte).

* shape is provably 0 or 1: `$A500 LDA $65 / AND #$0F / SEC / SBC #$01`, and
  stage 5's four inline-5 arm records hold `$01 $12 $02 $21` in that byte
  (read out of `prg.bin` this session), so the nibbles are 1 and 2.
* so the overrun needs `$0460,Y >= 2`, and `$0460,Y` is **dual-purpose**:
  `$A4FC` seeds it to 1 and `$C086 ADC $046C,X` adds 1 or 2 per hit
  (`src/state.js:373` calls it "per-handler state / damage count"). Captured at
  the throw: group 3 base `$90`, owner slot 8, shape 1, `$0460+8` = 1 at the
  start of the frame and the read lands on `$CC34`, i.e. `z9A` = 9.

So **one hit on an arm owner is enough to put the read off the end.** I reached
it only with the shield pinned at `$FF` (impossible - `$8997` sets 5), so I am
NOT claiming it is reachable in ordinary play. What is settled is that the index
is unbounded and the tables are 8 bytes. W32c §10 already listed "`$CC1F` rows 2
and 3 (exported, unread)" as an open item; this is what is on the other side of
that door.

---

## §6. WHAT I COULD NOT REACH - attempts, not absences

* **`$C159`'s spawn.** 900 frames from stage 1 chunk 2 with a chaser; the type
  `$29` never appeared. I did not try other chunks or trigger-aligned seeds.
* **`$C85D`** (the moai's `STA ($9A),Y` leaving `$0500-$06FF`). Stage 3
  (`$19`=2) has 45 type-`$16` records and all seven of its chunks ran 1400
  frames clean. Tripwire not tripped; that is not proof it cannot be.
* **`$9B10` / `$9721`** need the pause-screen button code (`$33` == `$0A`). I
  did not drive an input sequence for it.
* **`jt_$982F` arms 7–13.** Ruled out by a static scan of every `$1B` writer,
  not by a run.
* **Any cartridge comparison of anything here.** Same gap W32b and W32c both
  reported. Every number in §3/§4/§5 is port-vs-listing, not port-vs-board.
  W32c §10 handed forward `tools/oracle/b559poke.py` at f1400 as the nearly-free
  next step and it is still the highest-value unclaimed work.
* **Whether `$B434` is a port bug or a cartridge overrun.** §5a.

---

## §7. WHAT `stageledger.py` ACTUALLY MEASURES (P2)

### The two columns, and the gulf between them

The RECORD columns (`distinct / ported / unported / inline5 / ported %`) measure
one thing and measure it honestly: *for each distinct wave-record ROM address in
a stage's chunk streams, is the record's type's `$AE1C` handler a `case` in
`dispatch()`, and (for `cmd >= $F0`) is the arm its stage routes to implemented*.
Both are read LIVE out of `src/enemies.js`, so they cannot go stale. Good signal.

The RUNNABILITY column is a different animal, and the word RUNNABLE is doing
work the code does not do. Read out of the source this session, it is exactly
**two source-text predicates**:

1. `_engine_scope_limit()` - regex the integer `N` out of `runEngine`'s
   `if (stageIndex >= N)` and admit `$19 < N`;
2. `_ported_late_arms()` - parse `lateSpawner()`'s `switch`, and call an arm
   ported if its `case` body contains the token `return` and not the token
   `throw`.

That is the whole verdict. **It never runs a frame.** It does not open
`collision.js`, `terrain.js`, `weapons.js`, `oam.js` or `nmi.js` at all - and
four of the six crashes in §3 live in `collision.js`, one in `enemies.js` well
away from `lateSpawner`, and `$9751` in `nmi.js`.

| a reader assumes RUNNABLE means | what it measures |
|---|---|
| "a player can play this stage" | "`runEngine`'s guard admits `$19`" |
| "the stage does not crash" | "…and `jt_$C439[$19]`'s `case` has no `throw`" |
| "somebody ran it" | nothing was run |

So the column is **a statement about two `if`s in one file**, presented in a
table whose neighbouring columns are genuine ROM census. `$BC44` was in
`enemies.js`, inside `moveBullet`'s allocator path - a routine the ledger has no
opinion about - and stages 3 and 4 printed RUNNABLE for two waves with it live.
My five are the same shape. **This is a metric that cannot see the thing it
implies**, and it is not a near miss: the implication and the measurement do not
overlap anywhere.

It has form. W32a found the same file reporting the LATEST scroll for records
whose chunk pointers are shared, making stage 6 read 512 px more finished than
it was, since W28 - I re-read the fix in place this session (`if p not in recs or
r['scroll'] < recs[p]['scroll']`, with the two measured costs in the comment).
**Both errors flatter the port.** That is twice, in the same file, in the
direction that makes a wave look finished.

### The check that would have caught `$BC44` - and all five of mine

It is §3, and it is the cheapest thing in this report:

> For each stage the scope guard admits, and for each of that stage's chunks,
> seed the engine on that chunk's stream pointer, step the camera, and run
> `nmi()` for N frames with the fire button held. **Require zero throws.**

Measured cost, this session: **36 chunk runs × up to 1400 frames = about 40,000
`nmi()` frames in 1.53 s wall clock**, headless, no emulator, no assets beyond
what the suite already loads. It found five crashes on its first run, two of
them in code nobody has looked at since W12.

Three properties make it the right check rather than merely a check:

* it is **not** a frame count dressed as coverage - the assertion is "no throw",
  and a throw is a first divergence with an address on it;
* it needs no denominator, so it cannot invent one;
* and it **fails for the right reason**: a stage that cannot survive its own
  wave stream is not runnable, whatever two `if`s say.

The honest replacement for the column is two columns, not one:
`admitted` (what it measures today) and `survives its own chunks` (what a reader
thinks it means). A stage should not print RUNNABLE on the first alone.

---

## §8. `tablecoverage.py` - the blind spot did not close, and there is a second one (P3)

### 8a. The original blind spot is still there, and it is half the tool's subject

Run this session, unmodified tree:

```
TABLES: 81 PRG bases indexed by the 42 $AE1C handlers + $C413 + 4 stage-5 roots;
        53 exported ranges (7597 bytes)
  KNOWN GAP $CF2D / $CF2E  (ending chain, excluded by 20-plan §5)
METASPRITES: 64 ids named by the ROM, 157 exported
OK
```

W32b and W32c added four roots (`$8BD9`, `$CB91`, `$BEF3`, `$A16F`) and closed
seven specific ranges. **They did not close the class.** Measured this session by
importing `tablecoverage` and walking a second root set - everything the NMI
frame reaches (`$80A1`, `$80A7`, `$80AA`, `$9650`, and every entry of
`jt_$80D4`, `jt_$88AD`, `jt_$8989`, `jt_$96C5`, `jt_$982F`, `jt_$C439`):

```
PRG bytes reached by the TOOL's roots  : 2793
PRG bytes reached by the WHOLE frame   : 6472      (2.3x)
indexed PRG bases, tool roots          : 81
indexed PRG bases, whole frame         : 165
indexed bases OUTSIDE the tool's walk  : 84   (51 % of the total)
```

Of those 84, **51 are already exported** (the tool would have said OK anyway) and
**33 are in no `TABLE_FILES` block**. Most of the 33 are the terrain/streamer
tables the tool's own docstring predicts as false positives - `$9D4F`, `$9D50`,
`$9D6D`, `$9D6F`, `$9D73`, `$9FB4`, `$9FBC`–`$9FED` are decoded into
`terrain/stages.json`, and `$98FD`/`$9A35`/`$9A3D`/`$9A45` into the same file's
per-stage fields. Those are not gaps. What is left after removing them, and what
a future wave should decide about one at a time:

| base | read by | what it belongs to |
|---|---|---|
| `$8254`, `$82B4` | `$822F`, `$82AD` | the `$82xx` score/BCD block |
| `$8893`, `$8894` | `$882E`, `$8833` | `$882C`'s 2304-PPU-write screen load (only its RAM side effects are reproduced) |
| `$8AA8`, `$8B08` | `$8A9E`, `$8B2F` | the VRAM drainer / OAM sprite pass |
| `$8D9E`, `$8D9F`, `$8E9E`, `$8E9F` | `$8AB0`–`$8ABD` | the same |
| `$9749` | `$9729` | the continue path (`$9721`, unported and throwing) |
| `$9CB5`, `$9CB8` | `$9C88`, `$9C9E` | the stage intro |
| `$CE31` | `$CDC0` | the ending chain (same exclusion as `$CF2D`) |
| `$99AE` | `$AE1E` | **a false positive** - `$AE1E` is inside the `$AE1C` table's own bytes, decoded as code by the linear walker |

**So the green is still a statement about the walk.** It is a *correct* green
about crashes today, because every one of the 33 is either exported elsewhere,
inside unported code, or a decode artefact - but that is a fact I had to measure,
not something the tool asserts.

### 8b. THE SECOND BLIND SPOT, AND IT IS THE ONE THAT BIT

`tablecoverage.py` checks that every indexed **BASE** is inside an exported
range. It has no opinion about the **EXTENT**, and no opinion about the index.

Both crashes in §5 are on bases the tool passes:

```
$B42F   exported as enemies/tables.json phaseB42F  $B42F-$B433   5 bytes
        read by $B415 LDA $B42F,Y with Y = $04AC, INCd without bound
        -> $B434 = sub_B434's own opcode. OK from the tool. CRASH in play.

$CC23   exported as enemies/tables.json armShapeParams $CC1F-$CC32
        read by $CC7C LDA $CC23,Y and $CC85 LDA $CC2B,Y, 8 entries each,
        Y = ($0460,owner << 2) + shape, unbounded because $0460 is a DAMAGE
        COUNTER -> $CC33/$CC34. OK from the tool. CRASH in play.
```

and a third, latent, with the same shape and no crash yet observed:

```
$B45C   exported as phaseB45C  $B45C-$B460  5 bytes, read by $B439 LDA $B45C,Y
        with the same unbounded $04AC. Entry 14's twin of §5a.
```

against exactly one the port DOES guard:

```
$B200   arcTurns $B200-$B204, read by $B1C5 -- and enemies.js:2241 is a NAMED
        THROW citing $B205 and backed by 27,400 cartridge frames of Y never
        exceeding 4 (W12's number, quoted, not mine).
```

**One of four is guarded.** The pattern "a 5- or 8-entry table indexed by a
counter the routine INCs" is enumerable statically - every `LDA table,Y` whose
table sits inside an exported block, paired with whether any code bounds the
index - and `tablecoverage.py` is already the tool holding both halves of that
join. It is the natural place for the check and it is not there.

---

## §9. MUTATION SURVIVORS, W30 → W32c, CONSOLIDATED (P4)

Six survivors were reported across the five waves. Consolidated, and one of them
turns out to have closed without anybody noticing.

| wave | mutant | status now |
|---|---|---|
| W30 | **M2** - `$A466`'s `CMP #$02` relaxed from `==` to `>=` | **(a) CLOSED - verified this session** |
| W31 | M21 - the port reads `$C601` where `$C4F4` holds the same 50 bytes | **(b) provably uncatchable** |
| W32a | (none) - M12 was a survivor on the first run and was fixed within the wave | closed in-wave |
| W32a | check 4 is reddened by no mutant *by construction* (it asserts three ROM byte strings) | not a survivor; an independent-derivation check, `docs/knowledge/03` |
| W32b | M12 - `$CBB2`'s `LDA $AE / BNE $CBC0` one-shot deleted | **(a) CLOSED by W32c's M33 (2 red)** - re-verified by W32c, not re-done here |
| W32c | **M34** - `$CBB8`'s timer reset swapped with `$CBBD JSR $CBD1` | **(b) provably uncatchable** |

### (a) W30's M2 - closed, and closed by accident

W30 wrote: *"The `>=` case becomes testable in W32, when the stage-5 arm lands
and `$19 = 4` can reach the splitter; whoever writes it should add the mutant
back."* W32a, W32b and W32c all moved the guard and **none of them added it
back**. So I did.

Method, per the brief: on a COPY. `games/gradius/{src,tests,assets,tools/*.mjs,
tools/*.py,rip/prg.asm,index.html,game.json}` copied to the scratchpad; the copy
baselines at **543 pass / 10 fail / 11 skipped** (the 10 are the touch-pad suite,
the 11 need `tools/oracle/out` captures - both are copy-environment gaps, not
port state). Mutation applied to the COPY's `src/enemies.js`:

```
- if (state.zp19 === 2) return loc_A46F(state, rom);
+ if (state.zp19 >=  2) return loc_A46F(state, rom);
```

Result: **542 pass / 11 fail**, and the one new failure is

```
not ok 520 - THE MEASUREMENT THE GUARD RESTS ON: 1780 stage-5 nmi() frames, 0 throws
```

i.e. **W32c's own stage-5 measurement check is what discharges W30's obligation**
- because with the guard at `>= 5`, `$19 = 4` now reaches `$A466`, and a `>=`
there routes stage 5's four inline-5 arm records to the MOAI spawner instead of
the arm-group allocator, so the 1780-frame run stops producing arms. W30 asked
for a deliberate mutant; what closed it was a measurement written for another
purpose. Recorded that way rather than as a tidy win, because nobody knew.

Real-tree hash, `sha256` over `sha256sum` of every `.js` under
`games/gradius/{src,tests}`, sorted:

```
BEFORE  81899494b7595081bc680ff87ee62137d78af373fd6698525745f5b85afe6f26
AFTER   81899494b7595081bc680ff87ee62137d78af373fd6698525745f5b85afe6f26
```

`git status --porcelain games/gradius/` is empty. The copy has been deleted.
The real tree's own baseline, run read-only before any of this:
`node --test games/gradius/tests/` → **566 pass, 0 fail, 0 skipped**.

### (b) The two that are uncatchable, and why

* **W31 M21.** `$C601-$C632` and `$C4F4-$C525` are byte-identical 50-byte
  regions. No experiment on either side can distinguish which the port reads.
  The port reads the address the instruction names. This is a transcription
  decision, correctly labelled as one.
* **W32c M34.** Exactly two instructions in the whole PRG write `$0604`
  (`$CBA5 INC`, `$CBBA STA`) and `$CBD1`'s reachable set touches `$046C`, not
  `$0604`, so the two writes are independent and their ORDER has no observable
  consequence. W32c's M48 shows the write itself is guarded. I did not re-count
  the two writers; that is W32c's measurement and I am citing it.

### (c) Still open: none of the six

But three of the "what I could not reach" items from W30/W31 remain unpinned and
are the same species as a survivor, so they belong in this ledger:

* **W30: `$A485 STA $69`** - ported, unobservable from outside, no check.
* **W31: `$C5AD` at any rank but the endchain's** - 271 spawns, one rank.
* **W32c: `$CBCA` rows 1–6 and `$BEEA` rows 1–7** - transcribed, undriven.

---

## VERDICT

**FAIL - six shipped crashes, five of them new, all in stages the ledger prints
RUNNABLE.** Ranked most severe first.

1. **`$B415 LDA $B42F,Y` runs off a 5-entry table on stages 3 and 4, at frame
   314, with the player pressing nothing.** Deterministic, intervention-free,
   both stages, chunk 0. It is not even a named throw - it surfaces as
   `assets.js`'s "not in any exported range" and its message tells the reader to
   go edit `export_assets.py`, which is the wrong fix. Entry 14's twin table
   `$B45C` has the same missing guard. UNRESOLVED whether the port lets the
   enemy live one arc too long or the cartridge really reads `$B434`; the
   measurement that settles it is the one `$B1C5` already has.
2. **`$C2DC`, the breakable wall, on stage 2.** 227 field-2 cells across 42 of
   stage 2's 83 placed blocks - this is Stonehenge's entire signature mechanic.
   Shooting throws, first at frame 130, on 6 of 8 chunks. Stage 1's map has zero
   field-2 cells, which is exactly why every stage-1 measurement missed it.
3. **`$C13D` / `$C159`, types `$27` and `$29` touching the ship, on stages
   1–4.** Stage 1 - the most-played stage in the project - carries three `$27`
   records and one `$29`. Reproduced at frame 414 with the ship never moved.
   Both handlers are ported, so the objects spawn, move and draw; only the
   contact arm is missing, and it is tested before the shield and before the
   armed-enemy path, so no power-up state avoids it.
4. **`$CC7C/$CC85 LDA $CC23,Y` runs off two 8-entry tables on stage 5.** One hit
   on an arm owner puts `($0460 << 2) + shape` past the end. Reached only with
   the shield pinned at `$FF`, an impossible value - so **reachability in
   ordinary play is UNRESOLVED**, but the index is unbounded and the tables are
   8 bytes, and that part is settled.
5. **`$9751`, game over → restart to title, on every stage.** Documented and
   decided (no title screen), listed because it is a crash a real player reaches
   and my passive stage-4 runs hit it at frames 1295–1381.

And the two instruments:

6. **`stageledger.py`'s RUNNABLE column measures two `if`s in one file and never
   runs a frame.** Second time this file has been confidently wrong in the
   direction that flatters the port. The check that would have caught `$BC44`
   and all five of mine costs **1.53 seconds**.
7. **`tablecoverage.py`'s root blind spot did not close** - 84 of 165 indexed
   bases are still outside the walk - and it has a second one that is worse:
   it checks BASES, never EXTENTS, so it printed OK for both table overruns in
   this report. One of four `LDA table,Y` sites with an unbounded index is
   guarded.

Nothing in `games/gradius/src/` or `games/gradius/tests/` was modified. Nothing
was committed. `games/ddpdoj/` was not touched.

status: DONE

