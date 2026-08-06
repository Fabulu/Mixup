# 45 -- IMPLEMENTATION: the respawn, split into two mods

status: DONE

Gate: `node games/gradius/tools/test-all.mjs` -> **GREEN, 13 passed, 0 failed,
0 SKIPPED**; 47 scenarios / 29,693 of 29,693 frames compared, 0 failures;
**745 unit tests**, 0 failing (732 before this wave).

**Verdict up front.** "Gradius syndrome" is two stacked mechanics and the
cartridge keeps them in **two different routines with no shared byte**, so the
owner's split is not a design choice imposed on the ROM -- it is the shape the
ROM already has. `heal-gradius-syndrome` now takes one, a new mod `hard-won`
takes the other, and the old mod's mechanism is **deleted rather than tuned**.

The wave brief was wrong in one place and right in two, and one of its
instructions ("go ham") produced an invention that measurement then made
smaller.

---

## 1. THE PREMISE, CHECKED BEFORE ANYTHING WAS WRITTEN

| the brief said | verdict | how |
|---|---|---|
| `$C1D6` may be the wrong hook | **RIGHT, and it stopped being a hook at all for this mod** | the capture existed only to feed a replay into `$9B3E`. No `$9B3E`, no capture. `modRefuseDeath` is now two mods and one window |
| the rollback and the wipe may not be separable in the ROM's control flow | **THEY ARE SEPARABLE.** Two routines, no shared byte | `$97B1-$97BB` (`$24,X := min($3F AND $0E, 8)`) read back by `$9B68`; the wipe is `$9B3E LDX #$5A / STA $3D,X`. Neither branches on the other |
| "blinking and invulnerable" may be two mechanisms | **IT IS ONE** -- `rt.invuln` drives both, and the blink is the cartridge's own `$0120 = 0` "not drawn" encoding, not a renderer trick. The **fly-in** is the second counter, and it is second because it ends on ARRIVAL, not on time | `$8B10`'s walk (src/oam.js); `$82A1` parks the menu cursor the same way |
| the port may already have this written down | **PARTLY.** Grepped src/ first, five times over: `$9C88` and `$979D`'s save block were both already ported, commented and unused by the mod layer | `grep -n 'state.mods' src/*.js`, then the writers of `$0360` and of `$22,X` |

**AND ONE THE BRIEF DID NOT ASK ABOUT, WHICH CHANGED THE DESIGN.** The fly-in
was written to start at X = 0 and `tools/oracle/modscope.mjs` threw on seven of
the thirty-two loadouts, on the first frame after the first respawn:

```
$C3AD: $0360 = 0, so `LDA $0360 / BNE $C3D3` falls through into $C3AF (the SHOT
probe) with X whatever the caller left. The player X clamp is [16, 240]
($A03A), so this is unreachable on the cartridge too.
```

`$C3A5`'s terrain probe uses a non-zero `$0360` as its own "this is the PLAYER"
test. **X = 0 is not a position this game has.** The entry point is `$10`,
`$A03A`'s own LEFT clamp -- the leftmost pixel the Vic Viper is ever allowed to
occupy. The invention got smaller because the port refused to guess.

**AND ONE MORE, WHICH WAS A DEFECT IN THIS WAVE'S OWN FIRST DRAFT.** The
in-place respawn seeded the ship and left every other object alone, on the
reasoning that "leave the other 85 bytes" should extend to the object page.
MEASURED, by driving a respawn with two Options collected:

```
$45 options = 0
anim[0..11] = [1, 4, 5, 32, 0, 0, 0, 0, 0, 48, 0, 0]
```

`$8B10` draws object i whenever `$0120+i` is non-zero, and `$A0C8`'s animation
loop (`LDX $45 / DEX / BPL`) writes nothing at all at `$45 = 0`. **Two ghost
Options welded to the new ship for the rest of the run**, plus an orphan shot
and an orphan missile. `$9B47`'s object clear is now taken over slots 0-11 --
the player's twelve and not the ten enemy slots the cartridge's `LDX #$7F`
version also takes. Sec 4 and a test.

---

## 2. WHAT THE ROM PROVIDED

Everything except the fly-in itself, and most of it was already ported.

| the mod needs | the cartridge has | where |
|---|---|---|
| an explosion, a life, a pause, a game-over branch | all four, untouched | `$C1D6`, `$979F`, `$96EF`'s 120 frames, `$97C1 BMI $97F1` |
| a power-up wipe that is NOT a scene reset | the five capsule stores are a subset of `$9B3E`'s 91-byte clear; `$42` comes back from `$22,X` | `$9B3E`, `$9B64/$9B66` |
| a respawn position | one table byte carries both coordinates | `$9B88-$9BB5`, `$9BCC[$19]` -> `$9BD4` |
| "the intro is over, play" | two stores | `$9C3C`: `$60 := 1`, `$1B := $80` |
| a way to carry bytes across a death | **A SAVE BLOCK THAT ALREADY CARRIES FOUR** | `$979D` writes `$22,X $24,X $26,X $28,X`; `$9B62-$9B74` reads them all back |
| a way to drive the ship with no player | **THE ATTRACT DEMO'S OWN BUTTON WRITER** | `$9C88 STA $05 / STA $07` |

The last two are the finds of the wave. `hard-won` is not a parallel save
system: it is `$979D`'s own list with five more passengers, and `$42` is on the
ROM's list already but **degraded** -- `$97A5` stores 0 or 1, never the cursor's
real value -- so the mod carries it in full and the bar comes back parked where
the player left it. The fly-in is not an animation: it writes the two pad bytes
`$9C88` writes and the ship then moves through `$9FFC`'s own `AND #$01` arm at
`$A006`'s own speed, with `$A082`'s ring advancing and the Options trailing.

---

## 3. WHAT WAS INVENTED, AND SAID SO IN THE CODE

Three things, each named at the line that does it and in the THIRD RULE block at
the top of `src/mods.js`.

1. **THE FLY-IN.** Stock Gradius **teleports**. Established rather than assumed:
   the only writers of `$0360` in the whole PRG are `$9BAF` (the intro's
   teleport), `$A02E`/`$A040` (the player's own stick) and `$82A1` (the menu
   cursor). `$9B3E`'s intro path teleports and hands control over on the same
   frame. There is no entry animation for the player anywhere in this cartridge.
   The owner asked for one; it is built, from `$9C88` and `$9FFC`, and it enters
   at `$A03A`'s clamp because the port proved 0 illegal.
2. **THE INVULNERABILITY WINDOW.** Already declared in W41 and unchanged: the
   cartridge has no player i-frames. The two `BPL`s at `$C011`/`$C055` are the
   ENEMY's spawn guard.
3. **`rt.savedKit`, five extra save slots.** The bytes are the cartridge's, the
   shape is `$979D`'s, the storage is this file's.

**NOT invented, and worth naming because it looks like it should have been:**
the respawn Y and the fly-in's target X are `$9BD4[$9BCC[$19] + ($24,X >> 1)]`,
read out of the ROM's own table. `introReset()` passes `$3F` there because
`$9B68` has just loaded it from `$24,X`; the mod passes the CHECKPOINT instead,
because `$3F` is the live camera now and a live page walks straight out of
`$9BD4`'s five-entry-per-stage domain.

---

## 4. THE TWO MODS, EXACTLY

### `heal-gradius-syndrome` -- RESPAWN IN PLACE (same id, same name)

**The old mechanism is gone, not tuned.** It captured `{x, y, $3F}` at `$C1D6`
and replayed it into the tail of the NEXT `$9B3E` -- a position replay bolted
onto a stage intro. The player still watched the 27 blanked frames, still had
`$882C` reload the screen, still had the terrain restreamed from a page
boundary. That is the owner's *"it still put you back at some scene"*, and it is
also the shape that leaked across a game over in W43.

A death respawn under this mod **never reaches `$9B3E`**. `$97DB` hands the
frame to `modRespawnInPlace()`, which:

* wipes the six power-up bytes and **nothing else** of `$9B3E`'s 91 (`$42` from
  `$22,X`, `$35 := $14`)
* applies whatever kit the loadout is owed (`respawnKit()`, below)
* takes `$9B47`'s object clear over **slots 0-11 only** -- the ship, both
  Options, both shot chains and the three missiles -- and leaves the ten enemy
  slots the cartridge's own `LDX #$7F` version would also have taken
* seeds `$0100 := 1`, `$0120 := 1`, slots 0-2 and both 24-entry rings at
  (`$10`, the ROM's own table Y)
* runs `$9C3C`: `$60 := 1`, `$1B := $80`
* arms the blink and the fly-in

and returns **false**, so `$96EF`'s caller runs the mode-5 body on that very
frame. It is a play frame, not a stage intro. **What it deliberately does not
touch**, each with a reason in the source: `$39`/`$3A` (a warp the player earned
is not cancelled), `$57`/`$5E` (a terrain stream that is still running is not
re-seeded), `$882C` and `$83AB` (no intro means nothing to blank and nothing to
silence), `$0500-$06FF` (it belongs to enemies still on screen).

The camera, the terrain build cursor, the spawn engine and the enemies are
untouched. **The loadout is still wiped: stock rules, and that is the other mod.**

### `hard-won` -- KEEP YOUR LOADOUT (new, `combat`)

`$9B3E` runs in full, checkpoint rollback and all. The six power-up bytes are
captured at `$979D` -- immediately after `$97BF`, the last store of the
cartridge's own save block, and **before** `$97C1`'s game-over branch on purpose
-- and written back at the tail of `$9B3E`, where `$9B66` puts `$42` back.

New preset **`the-full-cure`** is the two of them and nothing else.

### `respawnKit()` -- ONE FUNCTION, BECAUSE TWO CALL SITES ASK

The ladder, highest first: `full-power` (`grantEveryIntro`) > `hard-won`
(`keepLoadout`, only when there is a capture) > `muscle-memory` (`stickyStart`)
> the picker's one grant (`rt.firstIntro`). Both the tail of `$9B3E` and the
in-place respawn call it, so **neither mod can quietly do the other's job**.
`resolveLoadout` reports no `conflicts` entry for these because they are three
different sim keys; the ordering is the contract, and it is walked as a
13-row matrix in `tests/mods.test.js`.

The full matrix, driven through the real routines
(`introReset` -> `die` -> `respawn`), picker `{speed 2, missile 1, meter 3,
weapon 2, options 1, shield 5}`, holding `[3,1,5,1,2,4]` at the death:

| loadout | kit after | `$3F` | enters at |
|---|---|---|---|
| stock | `[0,0,1,0,0,0]` | 4 (rolled back) | `$9BD4`'s table X |
| heal | `[0,0,1,0,0,0]` | 5 (kept) | `$10` |
| hard-won | `[3,1,5,1,2,4]` | 4 | table X |
| muscle-memory | `[2,1,3,2,1,5]` | 4 | table X |
| full-power | `[1,1,6,2,2,5]` | 4 | table X |
| heal + hard-won | `[3,1,5,1,2,4]` | 5 | `$10` |
| heal + full-power | `[1,1,6,2,2,5]` | 5 | `$10` |
| heal + muscle-memory | `[2,1,3,2,1,5]` | 5 | `$10` |
| hard-won + full-power | `[1,1,6,2,2,5]` | 4 | table X |
| hard-won + muscle-memory | `[3,1,5,1,2,4]` | 4 | table X |
| full-power + muscle-memory | `[1,1,6,2,2,5]` | 4 | table X |
| heal + hard-won + full-power | `[1,1,6,2,2,5]` | 5 | `$10` |
| heal + hard-won + muscle-memory | `[3,1,5,1,2,4]` | 5 | `$10` |

`immortal` sits above all of it by refusing `$C1D6`, so there is no respawn to
resolve; that row is its own test.

---

## 5. THE RUNTIME INVENTORY, RE-TABLED

`rt.death` is gone with the mechanism that needed it. `rt.savedKit` has its
lifetime exactly, on purpose -- **a second lifetime would be a second thing to
get wrong**, and W43 is what that costs.

| field | scope | written by | cleared / re-armed by |
|---|---|---|---|
| `rt.savedKit` | ONE DEATH | `modSaveLoadout` (`$979D`) | consumed at the tail of `$9B3E` **and** by the in-place respawn; dropped at `$97F1` (W43) and `$82D5` (W44) |
| `rt.invuln` | ONE RUN | the tail of `$9B3E`, and the in-place respawn | counts down in `modFrameEnd` (`$80B5`); forced to 0 at `$97F1` and `$82D5` |
| `rt.flyIn` | ONE RUN | the in-place respawn (a CAP of 240, not a length) | `modFlyIn` on arrival; `modFrameEnd`; 0 at `$9B3E`'s tail, `$97F1` and `$82D5` |
| `rt.flyInTo` | ONE RUN | the in-place respawn | `$97F1`, `$82D5` |
| `rt.firstIntro` | ONE RUN | `attachMods`; false at the first `$9B3E` or in-place respawn | true again at `$82D5` (W44) |
| `rt.ghost` | SESSION | `modPostRender` only | never; it is a framebuffer |
| `rt.discoPal` | SESSION | `modPalette` only | never; scratch |
| `state.save26/28[p]` | CARTRIDGE | `attachMods`, `modNewRun`, `$979D` | `$8424`, `$8307` |

THE ONE RULE's call-site inventory goes **7 -> 10**: `modFlyIn` at `$80A4`,
`modSaveLoadout` after `$97BF`, `modRespawnInPlace` at `$97DB`. Every one is
behind `if (state.mods)`; `grep -n 'state.mods' games/gradius/src/*.js` counts
them.

---

## 6. WHAT `modscope` NOW PROVES

24 loadouts -> **32** (20 mods, 5 presets, picker-only, and **6 compositions**,
which W44 said out loud it did not have). 4 neuters -> **6**. And a new
boundary.

**BOUNDARY R, THE RESPAWN.** W44 checked the four places a RUN begins and ends;
it did not check the place a LIFE does, and both new mods live there. It is
asserted **both ways**:

* with `respawnInPlace`: `$3F` did not move, `$1B == $80`, the ship is at
  `$A03A`'s clamp, a fly-in was armed;
* **on every other loadout**: `$3F == min($3F AND $0E, 8)` and `$1B == 1`, i.e.
  the cartridge's own rollback and its own stage intro. A mod that changed the
  stock respawn for everybody would sail through a check that only looked at its
  own rows.
* with `keepLoadout` and not `grantEveryIntro`: the six bytes that went into
  `$9B3E`'s wipe came out of it.

**THE STAGE SWEEP.** W44 said "modscope drives stage 3 only ... that is an
argument, not a measurement". Boundary R now runs on **all seven stages** for
three loadouts (21 sessions, about 20 s), because `romStartPos()` indexes
`$9BD4` through `$9BCC[$19]`, a per-stage base, and that is the one
stage-dependent read in the new code. Said out loud: the driver sends no input,
so its deaths are early and every sweep row lands on **checkpoint 0**. The rows
of `$9BD4` that are not (80, 96) -- stage 3 checkpoint 4 is (80, 112), stage 6
checkpoint 6 is (48, 160) -- are covered by a unit test against the ROM's own
bytes instead.

**THREE WITNESS MARGINS**, printed every run, each of which fails the tool if it
goes to zero. This is W44's own lesson applied three times: its first driver
reported GREEN with W43's fix removed because every death was captured at
`$3F = 0`.

```
WITNESS rollback: 7/8 respawnInPlace loadouts respawned on a page $9B68 would
                  have MOVED (e.g. $3F 1 stayed, the checkpoint was 0)
WITNESS kit:      3/5 keepLoadout loadouts respawned holding a NON-EMPTY bar
WITNESS continue: 5/5 keepLoadout loadouts died holding a bar a fresh run is
                  NOT owed (e.g. died on [0,0,0,1,2,0], run 2 is owed
                  [0,0,0,1,2,5])
```

---

## 7. SEEN TO FAIL

### the six neuters, in the gate, every run

Each patches a THROWAWAY COPY of `src/` under the OS temp dir, each needle must
appear exactly once, and each declares WHICH assertion it must trip -- red for
the wrong reason is a failure.

```
RED (good)  no-abandon         5/32 -- B2 game over: rt.savedKit survived
                                       ({"64":0,...,"68":1,"69":2,"70":0})
RED (good)  no-inplace         7/32 -- R respawn: $3F = 0 after the respawn, the
                                       camera was at 1 when $979D ran
                                       (+ $1B = $1, + X = 80, + no fly-in armed)
RED (good)  no-keep-loadout    3/32 -- R respawn: the loadout did not survive --
                                       [0,0,0,1,2,0] went into $9B3E's wipe and
                                       [0,0,0,0,0,0] came out
RED (good)  no-newrun         32/32 -- B1 run 1: $19 = 0, the loadout chose stage 2
RED (good)  mods-outside-play 32/32 -- D: the attract demo's simulation diverged
RED (good)  stale-kit-replayed 32/32 -- B3 run 2: THE DEAD RUN'S BAR WAS REPLAYED
                                       INTO A NEW GAME
```

**`stale-kit-replayed` CAUGHT THE TOOL BEING RED FOR THE WRONG REASON, AND THAT
IS WRITTEN DOWN BECAUSE IT ALMOST SHIPPED.** Its first `wants` string was
`B3 run 2: $46 shield`, and `checkRunStart` emits exactly those words when a
loadout **never applied at all** -- which is the `no-newrun` neuter's symptom,
not this one's. The tool reported RED (good) with a signature from
`picker-only`, a loadout that has no `keepLoadout` in it. The leak now has its
own sentence (`THE DEAD RUN'S BAR WAS REPLAYED INTO A NEW GAME`), emitted only
when run 2's bar is byte-for-byte what the last life died holding. This is the
same failure shape W44 recorded in its own self-check stage, found again in the
tool built to avoid it.

### the unit tests, by hand, one mutation at a time

Seven mutations, each restored afterwards, `node --test tests/mods.test.js`:

```
$97DB does not call modRespawnInPlace  -> not ok 15  Heal Gradius Syndrome does not roll the camera back
                                          not ok 16  ...and the new ship comes in from the left
                                          not ok 17  the fly-in is $9C88
                                          not ok 18  the fly-in reads $9BD4 through $9BCC[$19]
                                          not ok 19  the in-place respawn takes $9B47 over 12 slots
                                          not ok 38  THE MATRIX
$979D does not call modSaveLoadout     -> not ok 22  Hard Won carries the six power-up bytes
                                          not ok 23  Hard Won does NOT stop the checkpoint rollback
                                          not ok 38  THE MATRIX
$80A4 does not call modFlyIn           -> not ok 17  the fly-in is $9C88
$97F1 does not drop rt.savedKit        -> not ok 29  a game over abandons the death capture (W43)
                                          not ok 31  ...even with the WHOLE cure on
                                          not ok 37  every RUN-scoped byte is dropped at $97F1
respawnKit: hard-won above full-power  -> not ok 38  THE MATRIX
PLAYER_SLOTS 12 -> 1 (ghost Options)   -> not ok 19  the in-place respawn takes $9B47 over 12 slots
the fly-in never lets go (no arrival)  -> not ok 17  the fly-in is $9C88
restored                               -> 61/61
```

**Every check in this wave was seen to fail.** Nothing was written that could
not be made red, and the two that could only be made red for the wrong reason
(`stale-kit-replayed`, and W43's own second test which W44 had already retired)
say so above.

---

## 8. THE BASELINE WAS NOT WEAKENED

`compare.mjs` ran unchanged: **47 scenarios, 29,693 of 29,693 frames, 0
failures**, with `state.mods` undefined throughout, and the seven self-check
neuters all red. Nothing in this wave can reach it -- every state modscope
builds attaches a loadout deliberately, and four tests hold THE ONE RULE.

The one place a mod now touches a file the cartridge comparison reads is
`src/flow.js`'s `respawn()` and `src/nmi.js`'s `$80A4`, and in both cases the
addition is a single `if (state.mods)` in front of a call. With no loadout
attached those are branch-not-taken tests, which is what THE ONE RULE is for and
what the 47 scenarios re-prove.

---

## 9. NOT DONE, AND SAID OUT LOUD

* **THE SOUND IS INHERITED, NOT MANAGED.** The in-place respawn makes no sound
  request and stops nothing, so it leaves the channels exactly as `$C1F5`'s
  explosion left them -- the same state the cartridge's own 120 dying frames
  have. `$9A4D`'s per-frame `JSR $8357` is the ROM's own way back to the BGM and
  it is untouched. `$1C` is deliberately NOT cleared: `$97DD` clears it because
  `$9B3E`/`$9BED` have just silenced everything, and this respawn silences
  nothing. **This is reasoned, not measured**: nothing in this repo can judge
  whether the result sounds right, and the driver's `$1C` was 0 on both sides.
  It is the first thing to listen for.
* **`mirror` + `heal-gradius-syndrome`.** The fly-in enters at game-coordinate
  X = 16 and flies right; with Mirror Gradius on, the screen is flipped, so it
  visually enters from the RIGHT. That is consistent with the mod ("the whole
  stage comes at you from the wrong side") and it is not corrected.
* **The stage sweep reaches checkpoint 0 only** (sec 6). The other `$9BD4` rows
  are unit-tested against the ROM's bytes, which is a different kind of evidence
  from a driven session.
* **No two-player session is driven.** `playerIndex()` still refuses `$18 = 1`
  and `attachMods` seeds slot `p` only. Unchanged from W44 and still outside
  every gate in this repo.
* **`respawnKit`'s ladder is a contract, not a `conflicts` badge.**
  `grantEveryIntro`, `keepLoadout` and `stickyStart` are three different sim
  keys, so `resolveLoadout` reports no conflict and the launcher shows no
  warning. Three mods answering one question without a badge is a real
  discoverability gap; the 13-row matrix is what stops it being a correctness
  gap.
* **The blink is still armed at every `$9B3E`,** not only at a respawn -- so a
  Heal Gradius Syndrome run starts each stage invulnerable for three seconds
  too. Deliberate (`$9721`'s continue cheat and `$9751` are respawns that DO go
  through `$9B3E`), and it is three seconds the cartridge does not give you.
* **Nothing here is evidence about the cartridge.** modscope says so on its last
  line and this file says so here.

---

## 10. FILES

* `games/gradius/src/mods.js` -- THE THIRD RULE (ported vs invented, with the
  greps); `hard-won`; the rewritten `heal-gradius-syndrome`; `the-full-cure`;
  `respawnKit()`; `modSaveLoadout()`; `modRespawnInPlace()`; `modFlyIn()`;
  `romStartPos()`; `FLY_IN_X`/`FLY_IN_CAP`; `rt.death` removed and
  `rt.savedKit`/`rt.flyIn`/`rt.flyInTo` added with lifetimes; `modRefuseDeath`
  no longer captures
* `games/gradius/src/flow.js` -- `modSaveLoadout` after `$97BF`;
  `modRespawnInPlace` at `$97DB`; `respawn()`'s three-tail return contract
* `games/gradius/src/nmi.js` -- `modFlyIn` after `$80A4`; `dyingArm`'s comment
* `games/gradius/tools/oracle/modscope.mjs` -- boundary R both ways, the
  seven-stage sweep, six compositions, three witness margins, two new neuters,
  `stale-kit-replayed`'s own sentence
* `games/gradius/tools/test-all.mjs` -- stage 1b5's description
* `games/gradius/tests/mods.test.js` -- 48 -> 61 tests, all seven mutations seen
  red
* `games/gradius/game.json`, `start.html` -- **UNCHANGED, AND THAT IS CHECKED.**
  `game.json` carries `"code": { "mods": "src/mods.js" }` and no catalogue;
  start.html builds its cards from `Object.entries(MODS)`. A new test asserts
  that neither file names any mod id, so there is no second list to keep current

status: DONE
