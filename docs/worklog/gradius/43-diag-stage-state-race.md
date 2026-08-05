# 43 -- DIAGNOSIS: the stage/background split at the stage-2 boss

status: DONE

Gate after the fix: `node games/gradius/tools/test-all.mjs` -> **GREEN, 12
passed, 0 failed, 0 SKIPPED**; 47 scenarios / 29,693 of 29,693 frames compared,
0 failures; 727 unit tests (725 + the two below).

**Verdict, up front: PORT DEFECT, and it is not in the ported cartridge code.**
It is in `src/mods.js` -- the "Heal Gradius Syndrome" mod holds a death position
that outlives the run it belongs to, and a CONTINUE replays it into a brand-new
stage-1 game. The 34 briefs' hypothesis (a race between the boss-clear path and
the death/game-over path) is **disproved by measurement**, below.

---

## 1. THE REPORT, DECOMPOSED, AND WHAT EACH POINT TURNED OUT TO BE

> *"I went to boss 2, got shot down. Might be that at the same time boss died. I
> think it should've been game over but not sure. Anyway, suddenly the volcano
> from level 1 shot at me. Except the volcano wasn't there, it was all black
> space like level 2 boss. I survived, got to boss. Thought it was level 2 boss,
> but when I beat it, level 2 started. Turns out it was level 1 boss."*

| # | the report | what it is |
|---|---|---|
| 1 | died at the stage-2 boss | true, and all that matters about it is `$3F = $0D` |
| 2 | "should've been game over" | it **was** -- `$97F1`, and that is the whole mechanism |
| 3 | "same time the boss died" | **incidental**. Any death at the stage-2 boss does it |
| 4 | stage-1 volcano firing | `$19 = 0` + `$1B = $82` -> `$A2F7` -> `jt_$C439[0]` = `$C486` |
| 5 | black space, no volcano | stage 1's `pageOrder[13] = 0`, the shared empty starfield -- plus `$99E9`'s `INC $5B` freezing the streamer |
| 6 | beat the boss -> stage 2 | `$9904` -> `$1B := $90` -> `$96CF INC $19` -> 1 |

Points 4-6 are all downstream of ONE wrong byte: `$3F` (and `$55`) = `$0D` at the
first play frame of a fresh stage-1 game.

---

## 2. THE MECHANISM

`src/mods.js` "Heal Gradius Syndrome" (`sim.respawnInPlace`):

* **capture** -- `modRefuseDeath()`, called at the top of `$C1D6`, stores
  `rt.death = { x, y, camHi: $3F }`.
* **replay** -- `modAfterIntroReset()`, called at the tail of `$9B3E`, writes
  `$3F` and `$55` from `d.camHi`, moves the ship and both Option rings, and
  then clears `rt.death`.

The unwritten assumption is *"the next `$9B3E` is this death's respawn."* That
holds for an ordinary death: `$96EF`'s countdown ends `JMP $979D`, and `$979D`
ends `JMP $9B3E` -- same frame, same run, same stage, 120 frames later.

**IT DOES NOT HOLD WHEN THE DEATH IS THE LAST LIFE.** `$97C1 BMI $97F1` goes to
the game-over entry, which sets `$1B := $C0` and never goes near `$9B3E`. The
capture then survives the whole ~400-frame game-over screen and is consumed by
the FIRST `$9B3E` of whatever leaves it -- and two of the three exits are a
different game:

```
$970D  CONTINUE  -> JSR $82D5 (a NEW GAME: $8307 wipes $0012-$00EF, so $19,
                    $24,X and $26,X all go to 0) -> $00 := 4 -> $8165 -> mode 5
                    with $1B = 0 -> $96BE -> $9B3E      <-- the owner's path
$9751  timeout   -> JSR $9B3E, then $00 := 0 (mode 0 rebuilds; harmless)
$9721  cheat     -> $97DD -> $9B3E, and $9730 has just written $24,X := 0
                    precisely so the player restarts at the START of the stage
```

So a CONTINUE produces a correct new game -- stage 1, three lives, score 0 -- and
then the mod teleports its camera and its terrain build cursor to page `$0D`,
the page the *previous* run died on.

Everything the owner saw follows from that, with no further defect:

1. `$9A4D` compares `$3F` against `res.stages[0].bossPage` = `$0C`. `$0D >= $0C`,
   so the run leaves `$80` for `$81` on its **first play frame**.
2. `$9A0E` (`$81`) seeds the countdown; `$99E9` (`$82`) runs `INC $5B` every
   frame, and `$5B` gates BOTH `$9AA0 JSR $98EE` (the camera) and
   `$9ACE JSR $9D83` (the terrain streamer). **The picture is frozen for the
   whole ~768-frame countdown.**
3. `$A2F0`'s `CMP #$82` hands the spawn engine to `$C413`, the LATE SPAWNER,
   whose `$C434 LDA $19 / JSR $83E4` dispatches `jt_$C439[0] = $C486` -- **stage
   1's volcano**. Type-`$0A` rocks erupt from a fixed base line (`$C4DF LDA #$90`)
   with nothing under them.
4. There is nothing under them because stage 1's `pageOrder[13] = 0` and
   `pageOrder[14]` is past the table -- pages `$0D`-`$0F` of stage 1 are the
   shared empty starfield screen. Genuinely black.
5. `$9982` (`$84`) sees `$3F != bossPage` and takes the ADVANCE arm, so the
   boss spawns immediately at the current page. Kill it -> `$86` -> `$3F` reaches
   `endPage` `$0E` -> `$1B := $90` -> `$96CF INC $19` -> **stage 2 begins.**

**Is it authentic cartridge behaviour? No.** `respawnInPlace` is code this repo
added; `src/mods.js` says so in as many words at `modRefuseDeath` ("this window
is BUILT, not ported"). The cartridge has no death-position memory to leak.

---

## 3. THE REPRODUCTION (deterministic, headless, every intervention labelled)

Driver: `resetState()` -> boot at mode 0 -> the port's own title, menu, START,
mode 3, mode 4, mode 5. Interventions, all printed on the frame they happen:

* **[I1] level select** -- `save26[0] := 1` at f282. This is exactly what the
  shipped level-select mod does (`src/mods.js:393`), i.e. a state a player
  reaches through the game's own front end.
* **[I2] invulnerability** -- until the forced death, undo `$C1F1`'s `$1B := $A0`
  and restore `$0100`/`$4C`. Same shape as the DaiOuJou ladders' `$FF` poke.
* **[I3] lives** -- `lives[0] := 0` on the forced-death frame, so `$979F`'s `DEC`
  takes it negative and `$97C1` branches to `$97F1`.
* **[I4] forced `$C1D6`** -- `die()` at the end of frame 9477, which is where the
  cartridge's own `$C0C7` would run it.
* **[I5] START** -- held at f9900, inside the continue window.

Trace (mod `heal-gradius-syndrome` on, nothing else):

```
f=9477  [I4] $C1D6      sub=$86 z19=1 cam=$0D0C            death := camHi $0D
f=9598  $97F1           sub=$C0 z19=1 lives=255            GAME OVER
f=9900  [I5] $970D      mode=4 z19=0 cam=$0000 s26=0       CONTINUE: a new game
f=9902  $9B3E           sub=$01 z19=0 cam=$0D00 bld=$0D00  <-- THE DEFECT
f=9928  $9C3C           sub=$80 z19=0 cam=$0D00
f=9929  $9A4D           sub=$81                            first play frame
f=9930  $9A0E           sub=$82                            frozen; VOLCANO
f=10701 $9982           sub=$85                            "got to boss"
f=12330 $B9A5           sub=$86                            "I beat it"
f=12843 $9904           sub=$90
f=12844 $96CF           sub=$80 z19=1 cam=$0001            "level 2 started"
```

The rendered frame at f9950 is the report verbatim: `1P 0000000`, three lives,
the Vic Viper in empty black space, and four erupting volcano rocks coming at
it with no volcano on screen.

---

## 4. WHAT WAS DISPROVED, AND WHAT THE `$9751` COMPARISON DOES NOT COVER

**The hypothesis 34 briefs rested on is not what happened.** It was worth
testing and it was tested:

* Every writer of `$19` was enumerated: `$96D1 INC` (nextStage), `$993B INC`
  (the warp), `$9B6E := $26,X` (the intro), `$8307 := 0` (new game). Every
  writer of the terrain selector (`$3A`, `$54`, `$55`, `$58`) was enumerated:
  `$9B3E`, `$96CF`, `$993B`, `$97DD`, `$8424`/`$8307`, `$9F94`. **`$993B` is the
  only site that moves one without the other** -- and that is the `$39` warp,
  where the ROM deliberately turns the streamer off (`INC $3A`) and runs the
  scripted black-space warp route `$984F`. Authentic, and it always ends in
  `$96CF`, which puts `$3A`, `$3F` and `$55` back in step.
* A **forced-death sweep** ran `$C1D6` at every frame from 50 frames before the
  stage-2 boss's death to past the stage advance (`die@18950 ... die@19700`), each
  followed by 800 more frames. `$19`, the build cursor and `$3A` stayed
  consistent on every one. The frame `$9904` writes `$1B := $90` behaves exactly
  as the ROM does: the death's `STA $1B` overwrites the stage-clear latch and
  the player replays the second half of the stage. Not a defect; not the report.
* The warp *was* driven (a labelled `$39 := 1` poke), including a death and a
  game over inside it, along both exits. `$3A` is cleared on every route out
  (`$97DD`, `$96CF`, `$8424`, `$8307`).

**The gap the promoted `gameover` scenario does not cover** is not a subtle one:

1. It compares the **timeout** exit of the game-over screen (`$9751` -> mode 0).
   It does not touch `$970D` CONTINUE at all -- and CONTINUE is the exit a player
   actually takes.
2. More importantly, **the oracle corpus is structurally blind to the entire mod
   layer.** The ONE RULE is that `state.mods` is `undefined` on every one of the
   47 scenarios and every unit test; that is what makes the cartridge comparison
   mean something, and it is also why no cartridge comparison can ever see a
   defect that lives in `src/mods.js`. 800/800 tier-1 fields exact across a
   restart is a true statement about a program the owner was not running.

That is the answer to "ask whether this is another instance of a green that
never ran": it is not a green that never ran, it is a green that ran on a
different program.

---

## 5. THE FIX, AND THE CHECK THAT WAS SEEN TO FAIL

**Fix** -- `src/mods.js` gains `modAbandonRun(state)` (clears `rt.death`), called
from `src/flow.js` `enterGameOver()` at the top of `$97F1`, behind
`if (state.mods)`. `$97F1` is the one instruction in the PRG that means "this
game has ended", and it is the only place a death does not lead to a `$9B3E` of
its own. When the run ends there is nothing to come back to.

The ONE RULE's call-site inventory in `src/mods.js`'s header goes from five to
six, and the import comment in `src/flow.js` is corrected with it. Mods off
remains the absence of an object.

**Check** -- two tests in `tests/mods.test.js`, driving the real routines
(`die` -> `respawn` -> `$97F1`, then `newGame` -> `st8165` -> `introReset`):

* `a game over abandons the death position ($97F1, W43)`
* `...so CONTINUE starts stage 1 at page 0, not at the page you died on`

**Both were seen red.** With `if (state.mods) modAbandonRun(state);` commented
out and nothing else changed:

```
not ok 20 - a game over abandons the death position ($97F1, W43)
  error: '$97F1 is the end of the run: there is nothing to come back to'
not ok 21 - ...so CONTINUE starts stage 1 at page 0, not at the page you died on
  error: "$3F is $9B68's checkpoint (0), NOT the previous run's death page $0D"
  expected: 0   actual: 13
# pass 41  # fail 2
```

Restored: 43/43 in `tests/mods.test.js`.

---

## 6. NOT FIXED, AND SAID OUT LOUD

* **`rt.firstIntro` has the same shape.** It is `false` for the rest of the
  session after the first `$9B3E`, so a CONTINUE -- which *is* a new game -- does
  not re-grant the picker's starting kit. That is a design question about what
  "what you start with" means across a continue, not the reported defect, and
  changing it would change play nobody asked to have changed. Named here so the
  next person does not have to rediscover the class.
* **The port's `?? 0` in `terrain.js` `emitBlock`** (`stage.pageOrder[b.hi] ?? 0`)
  is a port invention: the ROM's `LDA (screenOrder),Y` reads whatever byte is at
  that address. It is only reachable past the end of a stage's page table, where
  the game is already leaving the stage, and it was NOT what made this screen
  black (page `$0D` is a real `0` entry in stage 1's own table). Worth a byte
  export and a real read one day; not this wave's business.
* **`$9751`'s `$9B3E` also consumes the stale death** (measured: mode 0 for one
  frame with `$3F = $0D00`). With the fix it never gets one, because `$97F1` ran
  first on every path that reaches `$9751`.

---

## 7. FILES

* `games/gradius/src/mods.js` -- `modAbandonRun()`; ONE RULE inventory 5 -> 6
* `games/gradius/src/flow.js` -- the call at the top of `$97F1`; import comment
* `games/gradius/tests/mods.test.js` -- the two checks above

status: DONE
