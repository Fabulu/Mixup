# SAVEPOINT - where this project is, and how to pick it up

> ## STATE: THREE GAMES - ONE COMPLETE, TWO IN FLIGHT
>
> **This box said COMPLETE AND GREEN, and "there is no in-flight work", for a
> long time. That was true of Batman and has not been true of the repository
> since the second game started.** Three games sit behind `games/index.json`
> now, and two of them are live work.
>
> | game | machine | state |
> |---|---|---|
> | **Batman: Return of the Joker** | Game Boy | **complete** - title screen to end credits, bit-exact. Nothing in flight. |
> | **Gradius** | NES | all seven stages play, the game ends and loops back round; no known divergences. 19 mods, 4 presets, its own start screen. |
> | **DoDonPachi DaiOuJou (Black Label)** | IGS PGM arcade | **THE STANDING PRIORITY.** Stage 1 playable; the stage boss is not ported and sound has not started. |
>
> **The gate is three separate runners - there is no single `test-all`:**
>
> ```sh
> npm run test-all                        # Batman  - 27 stages, 27/27, zero skips
> node games/gradius/tools/test-all.mjs   # Gradius - 12 stages, NOT wired into the root
> node --test games/ddpdoj/tests/         # DaiOuJou - unit tests; no test-all exists yet,
>                                         #   the gates are individual (bundlegate.mjs,
>                                         #   webgate.mjs, and many more in tools/)
> node tools/publish.mjs                  # THE ONLY thing that runs all of them.
>                                         #   Refuses on a red gate OR ANY SKIP.
> ```
>
> **2,399 unit tests green** - 740 Batman, 725 Gradius, 934 DaiOuJou. Source:
> Batman 60 files / 18,069 lines, Gradius 25 / 17,956, DaiOuJou 61 / 30,934.
>
> **Where the in-flight work is written down:** `docs/worklog/ddpdoj/` and
> `docs/worklog/gradius/`, per wave, with the open debts. Start there, not here.
> DaiOuJou's standing bar is **two** conditions - feature complete *and*
> oracle-clean - because satisfying one and reporting the pair is a mistake this
> project has made more than once.
>
> **Three oracles, one per machine:** PyBoy (Batman, Python), Mesen 2.1.1
> (Gradius, Lua), MAME 0.288 (DaiOuJou, Lua, `-video none -sound none
> -nothrottle`). `docs/knowledge/` is the cross-game distillation and is the
> thing to read before starting a fourth.
>
> **Everything below this box is BATMAN unless it says otherwise.** It is
> accurate and still worth reading - the boss notes and the traps especially -
> but do not read a "done" in it as a statement about the repository.
>
> ### How you beat the bosses - asked in play, so it goes at the top
>
> **All four are beaten with FISTS.** This is not obvious and cost real
> playtesting to work out:
>
> - **Boss 1 (level 4).** `$3C67-$3C77` routes states 2/7/`$0A` into the
>   batarang ARMOUR arm at `$3C8A`, which plays cue `$1D` and never touches HP -
>   batarangs can do nothing to him, ever. `$26F0` gives the fist 2 damage and
>   `$26D7` forbids crits on any boss level, so **16 connecting punches**.
> - **Boss 2 (level 8).** Worse than useless with batarangs: a hit on a GROUNDED
>   boss 2 writes `$C741 = $1E` and `stBoss2` freezes him on the ground for those
>   30 frames, so the next one bounces too - a **self-sustaining zero-damage
>   lock** (measured: 82 connections, 0 damage, 2000 frames). Punch him, or
>   throw only while he is AIRBORNE (`$3C9E`).
> - **Boss 4, the Joker (level 14).** Batarangs home on `$C296`/`$C298` - enemy
>   slot 1, the CHASER - and the chaser ABSORBS them (`$3BF5`). 48 HP at 2 a
>   punch is **24 connecting punches**, and nothing can be damaged at all before
>   f728.
>
> ### What is left in BATMAN, and it is all deliberate
>
> Two families in `pixeldiff`, both excluded on purpose - do NOT "fix" either:
>
> - **The water dither** (l1/l2-water, and l1-spouts at 50-70%, the worst number
>   in the suite because it is warped to where the water column is tallest).
>   Hardware alternates the slab at 30 Hz and a DMG's slow LCD blends it; a
>   modern display turns that into a strobe over a third of the screen, so the
>   port approximates it SPATIALLY. Documented at `drawWindow`.
> - **The parallax feeder race** (l9/l10/l11 sky, ~87% from f120). One pixel of
>   SCX on the far sky band. Instruction-level timing, out of scope by §28/§36,
>   and BOTH options were measured over 200 frames - keeping the lookahead costs
>   6288 bad scanlines, dropping it costs 8112 and breaks from f3.
>
> Genuinely unported, all small and none blocking play: the melee hit-spark
> (`$2708-$271B`), the GAME OVER lettering's own death-burst OAM order (the HUD
> half IS ported), and coverage - not code - for level 6's alternate
> tile-animation table. See "What is NOT ported".
>
> ### The four traps that produced most of the bugs found here
>
> Every one of these shipped a defect while the suite reported green. They are
> written up as docs/03 lessons 37-41 and they are the most valuable thing in
> this file:
>
> 1. **A render check that asserts on the absence of an exception.** Three
>    harnesses drove level 6's clear and all said PASS while the game rendered a
>    solid white frame. "Renders without throwing" is not "renders a picture".
> 2. **A harness that sets up state the APPLICATION does not have.** Both ending
>    harnesses assigned `state.titleManifest` themselves, so both reported the
>    ending pixel-exact over 2,027,520 pixels while the shipped game drew a bare
>    rectangle. Removing that one line turns the same run into 59 of 88 frames
>    wrong.
> 3. **A sampled frame list with no transitions.** During a 130-frame hold every
>    candidate lag scores zero, so the "one lag must be exact on every frame"
>    invariant proves nothing.
> 4. **A unit test that takes the answer as an argument.** `drawYBob`'s tests
>    pass `grounded` in directly, so they exercise the arithmetic and never the
>    CALL SITE's operand - and stayed green through a bug that bobbed every
>    airborne enemy on four levels.
>
> ### Ground rules that keep being re-learned
>
> - **Measure; do not infer from the listing.** At least thirty fall-through
>   incidents across the three games, one of which invalidated shipped code. Do
>   not try to increment that number in a worklog - the project tried and the
>   ordinal forked; `docs/knowledge/02-traps.md` explains why it is a floor.
> - **Byte-exact data is not a correct picture.**
> - **Validate a new check by making it fail** - revert, watch it go red,
>   restore. If it cannot go red it is not a check.
> - **Never regex a structured file.** A `re.S` edit silently deleted three
>   oracle scenarios and the stage still reported PASS.
> - **`git add -A` sweeps up other agents' in-flight work.** Stage by name. And
>   `git checkout -- <file>` on a dirty tree discards uncommitted work in that
>   file, which is not a safe way to drop a probe.
> - **A check outside the gate rots.** `l14init.mjs` asserted level 14's
>   entrance block, by value, and was RED on all three difficulties for months
>   because nothing ran it. It is a stage now; so is everything else.


Read this first after any break. `docs/00-MASTER-REFERENCE.md` is the technical
spec; `docs/03-VERIFICATION.md` is how we prove correctness and carries the
running list of ROM behaviours that caused real bugs. This file is the map.

---

## What this is

A hand translation of **Batman: Return of the Joker** (Game Boy, Sunsoft 1992)
from its disassembly into readable JavaScript. **Not an emulator** - every
routine becomes a JS function we own, so the game can be retuned and modded.

Repo: **https://github.com/Fabulu/Mixup** (public, MIT - see `NOTICE.md`)

The project is called **Mixup**. Batman was phase 1; Gradius (NES) is phase 2
and DoDonPachi DaiOuJou (IGS PGM arcade) is phase 3 and the current work. The
long-term goal beyond tidiness is games that can be **combined** - Batman
playable inside Gradius, the Vic Viper playable in Batman - which is why the
launcher picks a game from `games/index.json` before it loads any game code.

There is also a demo build at gbtman.pages.dev - it ships extracted assets, so
it is deliberately NOT linked from the public README. The public site, when it
exists, will take an uploaded ROM and extract in the browser instead.

**Careful with what that build ships, because this paragraph was wrong for a
while.** It is mostly *derived* data - decoded level tables, a built VRAM
image, a transcribed sound script - but it is **not** free of verbatim
cartridge bytes. `build-dist.mjs`'s `PUBLISH_VERBATIM` list has five entries:
Batman's player tile pool and four DaiOuJou sprite colour shards, each with a
written reason, each printed on every build. The placeholder-art machinery
(`SUBSTITUTE`, `tools/make-placeholder-tiles.mjs`) is still there and is
deliberately **empty** - player.tiles.bin was taken back out of it by an owner
decision: the live site may serve real cartridge art, the repo may not. See
`NOTICE.md`, which is the accurate statement of this.

Nothing ROM-derived is committed, and that part is unchanged. `assets/`,
`disasm/`, `rip/`, `dist/` and the ROMs themselves are gitignored for every game
and regenerated from your own copies - and that is true of `src/` too: no ROM
table, sprite list or script survives as a literal anywhere in the port. Every
one travels through `assets/manifest.json`, and `tools/verify_assets.py`
re-reads each from raw file offsets so the exporter cannot verify itself.

**STATE (Batman): feature complete.** All fourteen levels play, every boss
included, title screen through to end credits. 27 gate stages green - 740 unit
tests, 50
frame-exact input scenarios, all 47 sound ids, a static typecheck, and two
stages that compare PIXELS rather than memory. Nothing is captured: every screen is built from ROM
data and diffed against the cartridge's own VRAM. The remaining gaps are
listed under "What is NOT ported" and none of them blocks play.

---

## The layout

Restructured in eleven phases so a second cartridge has somewhere to go. The
move itself was mechanical and the four gate numbers did not shift by a digit.

```
games/index.json          THE REGISTRY: [{ id, dir }]. Static JSON, no code --
                          the launcher renders the picker with zero game
                          modules imported.
games/batman/
  game.json               THE MANIFEST: identity, display {screen, frameHz},
                          code {entry, mods}, rom, entries[], options[],
                          characters[], enemies[].
  src/    60 files, 18,069 lines
    gametypes.js          @typedef GameState. A LEAF with zero imports, so it
                          can be imported by anything. The written-down
                          inventory of the 51 LAZY fields createState() never
                          declares -- the document a second game forks.
    game/frame.js         $0567-$0650, the main-loop body. THE ORDER FILE: the
                          sequence of calls here IS shadow-OAM order, which is
                          DMG sprite priority and the ten-per-line cut.
    host/runtime.js       The browser half. Zero ROM: canvas upscale, audio
                          arm, watchdog, fail reporter.
    main.js               boot(), the screen state machine, the async level
                          hand-offs, and the fixed-timestep loop -- which stays
                          here because it is fused to the screen dispatch.
    enemies/              driver.js (the ONLY file that knows any order),
                          states/ (8), bosses/ (4), plus record.js and the
                          five leaves.
    player/               anim.js ($1B4A, a JP target) and death.js
                          (sub_00_29E7, driven by the main loop, not the chain).
    input.js              BTN lives here now, not in player.js.
  tests/  33 files, 740 tests
  assets/                 untracked, regenerated from your own cartridge
games/gradius/            phase 2, NES. 25 source files, 17,956 lines, 725
                          tests, its own start.html and its own gate under
                          tools/test-all.mjs.
games/ddpdoj/             phase 3, IGS PGM arcade. 61 files, 30,934 lines, 934
                          tests. THE CURRENT WORK.
tools/                    stays at the root; tools/oracle/_env.mjs is the one
                          place that decides where a game's files are.
                          tools/publish.mjs is the only runner that gates all
                          three games.
```

`shared/platform/gb/` was described here as an empty placeholder for a second
consumer. **It no longer exists** - two more games arrived and nothing was
hoisted into it, which is the honest answer about how much the ports actually
share: the manifest shape and the launcher contract, and not much else.

**player.js and main.js were cut exactly three and two ways, and no further.**
player.js keeps its ~700-line `$1438..$1B4A` region as ONE file because that
region is a contiguous fall-through chain -- faceRight falls INTO moveRight,
moveRight's guard INTO attack, all five attack tails INTO vertical -- and three
shipped bugs are documented in that file as mis-modelled joins. Across files
those joins become ordinary imports and the reason is lost. Nothing checks a
wrong re-join: the oracle catches a behaviour change, not a refactor that
preserves behaviour today and loses the reason tomorrow.

**Order is now tested, and it was not before.** Five order mutations -- deleting
the `$FFA7` parity reversal, hoisting the lag gate above tryActivate, swapping
the stun and hit arms, moving the second `drawEnemies` flush past `updateDoors`,
reversing the draw queue at flush -- ALL PASSED the unit suite before
`tests/frameorder.test.js` and `tests/enemy-order.test.js` existed. They now
fail 4, 2, 1, 5 and 2 tests respectively, re-measured against the relocated code
after every move.

---

## The one thing that makes this project work

**An oracle runs the real ROM headless and diffs our state against it frame by
frame.** It never ships. Each game has its own - PyBoy for Batman, Mesen for
Gradius, MAME for DaiOuJou - and the method is written up once, cross-game, in
`docs/knowledge/01-the-oracle-method.md`. Batman's is PyBoy, and everything
below was found by it, not by reading the listing:

```
python tools/oracle/trace.py  --frames 620 --script "20:,600:R" --level 5
node   tools/render-frame.mjs --frames 620 --script "20:,600:R" --level 5
node   tools/oracle/regress.mjs         # the whole corpus
node   tools/oracle/vramdiff.mjs --record   # sub_00_0A0E, write for write
npm run test-all                        # 27 stages, the gate for everything
npm run typecheck                       # tsc over games/batman/src/ (stage 2)
```

**Current state: 50/50 oracle scenarios bit-exact, 740 unit tests, 27/27 stages
green with zero skips.** The corpus covers levels 1, 3, 4, 5, 6, 8, 9, 11, 12
and 14 over 14,519 frames.

If you change gameplay code and `test-all` goes red, you broke something real.

Two harness flags worth knowing, both taken by `trace.py` *and*
`render-frame.mjs` so scenarios stay comparable:

- `--ammo N` - inject batarangs without walking to a pickup.
- `--warp COL[,ROW]` - place the player directly. Late-level content is
  otherwise unreachable from a scripted input. It is applied **after frame 1**
  in both harnesses, because the oracle's first sample is taken during boot;
  get that wrong and every warped scenario sits permanently one frame skewed.

---

## Setup from a clean checkout

```sh
# 1. put your own legal ROM here, named exactly:
#      Batman - Return of the Joker (USA, Europe).gb
#      (No-Intro: CRC 5124bbec, SHA-1 345a332175f58304f91111a13b770662e5ea92c3)
pip install pyboy
python tools/export_assets.py     # -> assets/
python tools/gen_tunables.py      # -> src/tunables.js, read from the ROM
python tools/export_sound.py      # -> assets/sound.json (bank-7 sound data)
python -m http.server 8000        # module imports need a real origin
```

That is Batman's setup. Gradius and DaiOuJou each need their own ROM and their
own emulator (Mesen, MAME); `CONTRIBUTING.md` has all three setup blocks in one
place. The launcher lists whichever games have assets present, so a checkout
with one game's assets exported works fine.

Deploy: `node tools/build-dist.mjs` then
`npx wrangler@3 pages deploy dist --project-name=gbtman --branch=main`
(wrangler@4 needs Node ≥22).

`build-dist` reads every ROM in the repo root **and** every ROM a game has
extracted into `games/<id>/rip/rom/` - 42 MiB of arcade mask ROM, once DaiOuJou
arrived - inflates any `.gz` before checking it, and refuses to publish a file
that appears byte-for-byte inside one.

**This paragraph used to say "there is no allowlist", and that is no longer the
whole truth.** The old blanket mechanism (`SHIPPED_ANYWAY`) is gone. What
exists now is `PUBLISH_VERBATIM`: an enumerated list, five entries, each with a
written reason, each printed on every single build rather than folded into a
count - Batman's `player.tiles.bin` (6974 B of player animation art, without
which the port cannot draw its protagonist) and four DaiOuJou sprite colour
shards. Those are verbatim cartridge bytes and they are served by the live site,
by an explicit owner decision: **the site may serve real cartridge art, the repo
may not** - and the repo does not. Separately, `prg.bin`/`chr.bin`/`prg.asm`
(together the whole Gradius cartridge) are dropped outright via `NEVER_SHIP`.

`SUBSTITUTE` and `tools/make-placeholder-tiles.mjs` - which draws an ORIGINAL
blocky-robot placeholder of the same 6974 bytes with the same tile indexing -
are still there, working, and deliberately **empty**: player.tiles.bin was taken
back out by that same owner decision. Kept as the worked example for the next
asset where substituting IS the right answer. If it is ever used again, note
that it substitutes **at the copy**, so the local tree keeps the cartridge's
real tiles and the oracle and `pixeldiff.mjs` still measure against the real
thing (73 frames / 66894 wrong px / 96.023%, unchanged by the swap).
`node tools/make-placeholder-tiles.mjs --png rip/placeholder/sheet.png` draws a
contact sheet of all 31 poses.

`NOTICE.md` is the accurate statement of all of this and is the one to keep
current - it is the legal file.

---

### The newer probes

| tool | what it settles |
|---|---|
| `tools/oracle/drops.py` | the `$C6CF` pool from the instant an enemy dies -- kills a live enemy by zeroing its HP byte and dumps all four slots, player HP and the knockback timers per frame. `--hp` matters: at full health the pickup is consumed with `$FF8A` never moving, so the effect is invisible. |
| `tools/oracle/objtrace.py` + `objregress.mjs` | map objects: all 8 records x 16 bytes including the `+9/+$0A` screen cache, plus the `$D000` cells a type-6 block stamps. |
| `tools/audit_coverage.py` | **"what have we missed?", measured.** Cross-references every routine gbdis finds an xref to against every address any comment in `src/` cites, then ranks the gap by distance to the nearest citation. This is how the stage-intro screen (`sub_00_333F`) was found after sitting unported AND uncatalogued through the entire project. Run it after any big porting wave: `python tools/gbdis.py "<rom>" --all --outdir /tmp/dis` then `python tools/audit_coverage.py . /tmp/dis`. |
| `tools/oracle/flowscen.py` + `flowdiff.mjs` | route clears, death, CONTINUE and game over. **Event-capped, not frame-capped** -- each recording stops when the ROM's own sequencer lands (`$361E`/`$2AAD`/`$0150`) plus 90 settling frames, so a lag frame cannot skew it. |
| `tools/oracle/introscreen.mjs`, `endingshot.mjs` | **PIXELS, not memory.** Compare the 160x144 shade indices the renderer produces against the ones the cartridge actually displayed. They exist because a screen can be byte-exact on VRAM and still render wrong -- twice now. Copy this shape before trusting any new screen. |
| `tools/oracle/punchreach.py` + `punchreach.mjs` | the melee envelope, by disabling every real enemy and planting a fake record at a chosen offset at the instant the scan runs. Sweeping distance with a LIVE enemy is worthless -- it walks into range during the sample window and "hits" at every offset. |

---

## What is ported and verified

| system | state |
|---|---|
| Player physics, collision, slopes | bit-exact |
| Camera | bit-exact |
| Wall-cling / wall-jump | bit-exact |
| Punch, batarangs (throw, flight, return) | bit-exact |
| Scripted door moves, breakables, pickups | bit-exact |
| Map objects `$C1E8` - **all eleven types** | bit-exact (8 scenarios, all 16 record bytes + stamped cells) |
| Door/gate sequencer (`$C733-$C735`) + debris + the `$C693` effect pool | bit-exact, 8 scenarios - **level 13 is unblocked** |
| The six `sub_00_2CBE` branches (levels 1/2, 6, 7, 11, 12, 13 + the boss default) | bit-exact, 5 scenarios |
| Boss death: the `$C740` countdown, all four per-boss arms, the fanfare's timing | bit-exact, 3 scenarios |
| STAGE CLEAR screen (`loc_00_350F` blocks, `$3566` scripts, `$35B2` STAT/LYC) | **built from ROM data**, 8192/8192 B against the cartridge on levels 4/8/11 |
| Player death: the `$C1C0` burst, 452 frames to the handoff | bit-exact on levels 1, 3 and 4 |
| Map-object collision (`loc_00_2426`, all four probe modes) | bit-exact |
| VRAM script interpreter `sub_00_0A0E` | bit-exact (write stream: address, value AND order) |
| Title VRAM build (boot clear, block copies, `sub_00_34A4` fill) | bit-exact |
| Enemy AI - all states + drawing | bit-exact |
| Enemy death drops (`$C6CF`, `sub_00_0CF3` + `loc_00_1444`) | bit-exact - arc, both bounces and the rest latch |
| Bat-rope - extend, anchor, swing, tangent launch | bit-exact |
| Window layer: map + animated tiles | **built from ROM data**, 13376/13376 B across 11 levels |
| Raster/STAT program (`$0857`), all eight arms | bit-exact, 9 scenarios / 335,664 scanlines |
| Stage-intro card (`sub_00_333F`) | **built from ROM data**, 327680/327680 B; and PIXEL-exact, 184320 px |
| The ENDING (`loc_00_3652`) | 115712/115712 B and PIXEL-exact, 483840 px - the last screen |
| GAME OVER lettering (`$C1C0`) | bit-exact - 13504/13504 shadow-OAM bytes over 4 levels |
| Levels 9/10/11 parallax sky, levels 1/2 water band, level 6 track | bit-exact |
| Levels-1/2 water body (`src/water.js`): rise/fall, waterfall stamp, `$FF95` slow mode, the 1-dmg `$5A` hit, enemy slow-fall bit, splash pool | bit-exact |
| Levels-1/2 sewer-enemy respawner (`loc_00_2D3D` head + `loc_00_0EC3` init arm): slots 6/7 refilled from `0:$32F8`/`0:$32D8`, the crawl-out-of-the-wall-hole spawns | bit-exact to the f73 lag frame (`l1-sewer-respawner-emerge`) |
| Level transitions, death/lives/respawn | ported |
| Route clears, CONTINUE, game over (`$C753`/`$FFB5`) | verified against the ROM, 8 progress-flow scenarios |
| HUD energy bar | ported |
| Mod system + launcher, touch controls, fullscreen | ported |
| Difficulty `$C756` - **all 14 read sites**, including the hard-mode boss buffs (`$0D73`), the easy-mode level-14 chaser (`$0E01`) and the level-14 homing batarangs | ported |
| Sound driver + DMG APU, music and SFX | **bit-exact** - all 47 ROM ids, SFX over live music, and the fader |
| Title screen, its 8 LCD registers, and state 4's press-start flash | **built from ROM data** - 8192/8192 B, and all 120 flash iterations |
| STAGE CLEAR (`loc_00_34D0`) | **byte-exact**, 8192/8192 VRAM on all three boss levels |
| Round select / continue (`0:$035B`) | build bit-exact; cursor logic verified against the ROM over three `$C753`/`$FFB5` states |

---

## What is NOT ported

**The game is feature complete.** All fourteen levels are playable, every boss
included, and it runs from the title screen through to the end credits.

What follows is the honest remainder, and it is three items. The list grew
before it shrank: four things on it were found by measuring the OAM head and
the frame loop rather than the game state, and all four have since been closed
(below), while item 3's long-standing "unreachable" claim turned out to be an
artifact of idle recordings. Treat "we checked that" as a claim with a date on
it.

1. **The melee hit-spark effect** (`$2708-$271B`) is not spawned, including the
   crit's different sprite (`$97` against `$10`).
2. **OAM draw order for the GAME OVER lettering's own burst.** `$0567` runs
   the pair `sub_00_0F7B` (HUD) + `sub_00_29E7` at `$0573`/`$057A` when
   `$FFA7 == 0`, and the SAME pair at `$05E5`/`$05EC` when it does not. **The
   HUD half of that alternation IS ported now** - `src/game/frame.js` `hudFirst` and
   the two `drawHud` call sites. What is still unported is the BURST half: the
   death burst draws from inside `deathTick`/`updatePlayer` mid-frame and so
   does not move with the HUD. Measured: the burst's first OAM cursor
   alternates 20/44 on level 1, 20/60 on level 3, 20/88 on level 9. OAM index
   is DMG sprite priority and the 10-per-line cut, so it is occasionally
   visible where the letters cross the energy bar or the dying Batman.
3. **Level 6's `$FFC9 == 1` alternate tile-animation table** (`2:$625E`) has no
   COVERAGE. It was listed here for months as "never exercised, the conveyor
   came up 2 on every recorded frame". **That was wrong, and the way it was
   wrong is the lesson.** Every recording behind that claim was an IDLE one,
   and an idle player parks the track via the `$2F48` equal-column stop with
   whatever direction it arrived with - 2. MEASURED with the player actually
   moving (`tools/oracle/conveyordir.py`, script `20:,780:R`): the direction
   flips 2 → 1 at gameplay frame 68 and the `$3151` alt-table arm runs on
   **732 of 800 frames**. It is the DOMINANT arm, not a dead one. Anyone who
   plays level 6 is in it almost the whole time.

   The port already implements all three arms; what is missing is only the
   proof, and it is now cheap - `conveyordir.py` has the recording.

   **Do not conclude "unreachable" from idle recordings.** Ask what the input
   script was before believing a coverage claim.

### Closed since this list was written (kept so nobody re-opens them)

Three items that stood here for months are DONE, and every one was found by
measuring OAM or the frame loop rather than the game state:

- **The moon.** `$05A6` draws metasprite `$34` at OAM (128, 24) on levels
  9/10/11, every frame, even paused, outside the `$C740` gate. `src/game/frame.js`
  `drawSkySprite` draws it.
- **The `$C740 == $FF` HUD gate.** From the frame after a boss dies the
  cartridge draws no energy bar for the whole countdown and fanfare (~350
  frames), and level 14 shows none for its whole entrance. Both `drawHud`
  calls are gated on `c740Idle(state)`.
- **`sub_00_0F56`, the draw-Y bob** (`$1D24` for the player, `1:$606F` for
  enemies). 2 px on level 6, 3 px on 9/10/11, one frame in eight, grounded
  subjects only. Ported - and getting the enemy gate's operand wrong (`r[1]`
  where the air bits are `r[0]`) is what made the train levels judder far
  harder than the cartridge, docs/03 lesson 41.
- **`$FFB1`/`$FFA7` across a pause and across the victory fanfare.** The
  VBlank ISR owns them and `$C716` gates only the main loop, so they keep
  ticking. Both blocking paths in `src/game/frame.js` tick them now.

**Lag frames** (`$C757`) are out of scope by definition, not undone: they are
instruction-level timing. See docs/03-VERIFICATION.md §28.

One deliberate deviation, documented at `drawWindow`: the water's 50% dither is
reproduced SPATIALLY rather than as the hardware's 30 Hz alternation between
"slab" and "no slab". A DMG's slow LCD integrates that into translucency; a
modern display turns it into a violent strobe over a third of the screen, which
is a photosensitivity hazard. Do not "fix" it back.

---

## Known-approximate (ported but NOT oracle-verified)

Be suspicious of these; they are the likeliest source of a surprise.

- **The melee CRIT window, and every arm the scenarios do not reach**
  (`meleeHitTest` in enemies.js). Both hit tests are exact transcriptions, and
  their ORDINARY paths are oracle-verified (`l3-punch-miss-behind`,
  `l3-punch-connect`, `l3-batarang-kill`): SCREEN-space scans over cached
  `+7/+8` bytes - melee off the mode-5 probe (`loc_00_2643`, enemy-owned
  half-extents, strict compares, player recoil vx = −4), batarang at
  `loc_00_3C17` (`$1216` box, inclusive, catch-tested BEFORE the hit test).

  Be precise about what "verified" covers. Hooking the ROM arms across the four
  scenarios showed several never executing - and a later sweep
  (`tools/oracle/punchreach.py`, which disables every real enemy and plants a
  fake record at a chosen offset at the instant the scan runs) has since
  measured the whole envelope over 218 sweep points, with the port agreeing at
  every one. That exercised `$26A0`, the facing-left retry, **and its
  succeeding branch**, which no scenario had ever reached. Measured: the punch
  probe sits +14 px ahead and 5 px up; the X window is probe-relative
  [−13, +5] facing right and mirrored facing left; the Y window is ±14 px
  (strict < 15).

  Still never reached by any scenario: `$26DD` (crit), `$3C8A` (the whole
  armored 2/7/`$0A` bounce), `$20FB` (a punch treating water as empty), and
  `$3C7B`/`$3C80`/`$3C85` (the immune states). `$271F` fires twice but never with a second candidate in
  range, so "first hit only" is unit-tested and not oracle-tested. And the
  retry arm runs seven times and FAILS all seven - its succeeding branch is
  never taken. Those are transcriptions with unit tests, not measured
  behaviour. What remains approximate on top of all that is the crit: `$26D0`
  reads **rLY
  mid-frame** (measured 44 on the one connecting punch - instruction-level
  timing, out of scope by §28), so the port's rLY model is pseudo-random at
  the right ~3% rate but can never agree punch-for-punch. If a scenario ever
  trips it, widen the scenario, don't chase the model.
- **State-2's ranged attack and projectile flight.** Literal ports with unit
  tests, but no natural input script triggers them, so no frame-by-frame proof.
- ~~**Post-death behaviour**~~ - DONE. Death routes back to round select, the
  sequence runs its real 452 frames, and `$FFB5`/`$C753` are maintained, so
  CONTINUE and the cleared-route skipping both work. Covered by the
  `progress-flow` and `death-sequences` gate stages.
- **NOTHING is captured any more.** Both remaining captures are retired and
  `tools/rip_water.py` / `tools/rip_title.py` are deleted along with them.

  The window map and the animated tiles are BUILT (`applyLevelArt` /
  `tickTileAnim` in water.js), verified 13376/13376 bytes across 11 levels by
  the `level-art` gate stage. The title's eight LCD registers are DERIVED
  (`title-state` stage), as is state 4's press-start flash.

  Two lessons are worth keeping from how long that took:

  1. **The task was filed against the wrong address for months.** `$0E24` is
     not the window-surface script - it sits behind `$0DD9: CP $0E / JP NZ`,
     so it runs on level 14 and nowhere else. What paints the window on every
     other level is a pair of instructions three apart inside level init:
     `$04C9` fills 960 cells with tile `$01`, `$04D7` runs a 47-byte script at
     `0:$32A3`. Chasing the filed address would never have found it. The
     fall-through rule applies to task descriptions too.
  2. **`$3148` reads `$FFC9` every frame, not at init.** Level 6's conveyor
     rewrites it at `$05C6`, one call before the streamer, so caching the
     choice at level load picks up the zero `$0F0F` left there and animates
     nothing.

  Applying each 32-byte block on its staging frame rather than modelling the
  `$FF9B` VBlank queue is measured-correct - one block per frame, gap set
  exactly `{1}` over ~1400 gameplay frames across ten levels - and
  `waterdiff.mjs` fails loudly if a recording ever shows a gap of 2.

---

## Sound

Music and effects both play and sound close to right. It is **not** bit-exact
yet, and it has its own oracle loop, separate from the frame oracle:

```
python tools/oracle/sound.py --id 2 --mask 3 --ticks 120   # record the cartridge
python tools/oracle/sound.py --under 0x10 --lead 60        # an SFX over live music
node   tools/oracle/sounddiff.mjs --id 2 [--show 8]        # diff, per register
node   tools/rendersong.mjs --id 2 --seconds 15            # -> a WAV to listen to
node   tools/rendersong.mjs --id 0x10 --dump 6             # per-tick writes
```

- `src/sound/apu.js` - the DMG chip. The one piece here that is *not* a code
  translation, because it is not code. Register writes in, samples out, no Web
  Audio dependency, unit-tested under node.
- `src/sound/driver.js` - `7:$412B`. Eight track slots, channel ownership in
  `$C800-$C803` (higher index wins, so SFX pre-empt music), the note/duration/
  gate machine, volume and pitch envelopes, drums, slides, opcode dispatch.
- `src/sound/index.js` - runs the driver on the **audio** clock at 4096/69 =
  59.36 Hz. It is a timer-interrupt routine, not VBlank; driving it from
  `requestAnimationFrame` would tie tempo to the display refresh.

**It is bit-exact.** `node tools/oracle/sounddiff.mjs --all` compares 52
recordings / 29 800 ticks - all 47 ROM sound ids, SFX played *over* live music,
and the fade-out - across all four channels plus NR50/NR51. `UNIMPLEMENTED_OPS`
is empty. This is a gate stage (`sound-driver`) and needs no PyBoy, because it
replays recordings already on disk.

Two rules were doing all the damage, and both are worth remembering:

- **`DEFSLIDE`'s note is the ATTACK note; the byte in the stream is the
  DESTINATION.** `7:$450D` plays the preset's own note for the preset's own
  duration and subtracts it from the written one. Playing the destination from
  tick one is why the target and rate looked right and only the origin was
  wrong.
- **`$F9 GATE` doubles its operand** (`ADD A,A` at `$468F`), and the gate is
  `(min(dur, +$06) >> 1) - 1`. Undoubled, key-off fired one tick early and cut
  the volume table short - which is the entire "mysterious envelope drift".
  Nothing governs that table; it was simply never being heard to the end. With
  `GATE_OFF` the ROM computes `$FF`, a value a duration counter can never
  equal, so an ungated note runs to its full length; special-casing 0 released
  every one of them halfway through.

Note `sub_00_0AE1` takes **B as the sound id and C as the mask** - `LD BC,$1601`
is id `$16`. Reversed, a cue still plays, just the wrong one, and no memory
comparison will ever catch it.

---

## Diagnosis archive - bugs that WERE open, and how each was cornered

Every entry here is fixed. They are kept because the reasoning is the reusable
part: each one is a worked example of cornering a bug against the cartridge
rather than against the listing.

- **Level 2 → 3 arrival - FIXED.** It was never a transition bug. The scan at
  `loc_00_2426` is now ported (`actorOverlap` in collision.js) and level 3 is
  bit-exact for 350 frames (`l3-object-floor`). What follows is the diagnosis,
  kept because the reasoning is the useful part:

  1. The transition path and the direct-load path **agree**. Both reach
     `sub_00_2889`, whose tail at `$2973` writes `$FF81`/`$FF83` from
     `1:$7CED`, and both land the player at **column 1, row 30** - exactly what
     the manifest says. There is no level-3 special case, and the earlier
     "direct load spawns at row 19" claim was wrong; the port dies on a direct
     boot into level 3 too. Nothing in `$2820`-`$285A` touches the player
     position at all.
  2. Row 30 in level 3 genuinely has **no map cell** under it. Col 1 is air
     from row 1 down, on the cartridge and in our export alike
     (`checkmap.py --level 3` is now an EXACT MATCH).
  3. What holds the player up is a **map object**. `$C1E8` slot 0 is a type
     `$08` that activates to `$88` (bit 7 = live) at level init. The floor
     probe finds air in the map, falls through the slope look, and reaches
     `loc_00_2426` - a scan over all 8 `$C1E8` slots that AABB-tests the probe
     point against each live object's box. On a hit `$2610` rewrites the
     player's Y to the object's surface and `$2622` returns `$FF`
     (`SOLID_RUNTIME`). Verified by hooking the return of `sub_00_20BA`: it
     returns `$FF`, and Y snaps 7683 → 7680 inside the call, every frame.

  **The port implemented none of `$2426`-`$2643`.** `slopeProbe` treated
  `$2418`/`$2423` as "return the neighbour's collision" and "return 0", but both
  of those labels *fall into* the object scan. So every map object was
  intangible, and level 3 starts you on one.

  Why this stayed hidden: the scan skips masked types `$07` and `$09`
  outright (`$2454`, `$2459`) and ignores anything with bit 7 clear - and
  types 3, 7, 9 are precisely the three the port has. Levels 1, 5, 7 use only
  those; 2, 4, 8, 9, 10, 11, 14 have no objects at all. Level 3 is the first
  level that uses a type outside that set.

  **What landed:** the whole scan, all four probe-mode arms, plus the screen
  position cache at `+9/+$0A` that every handler writes (1:`$4852`) and the
  scan compares against - an object that never writes those is invisible to
  collision while still drawing correctly. Two traps worth keeping in mind:

  - Only the FLOOR probe reaches the slope tables and the scan from a
    *non-empty* neighbour. `$2155`/`$2138` test the mode and every other one
    takes `LD A,B / RET` at `$215C`/`$213F`. Routing mode 3 into the scan there
    broke the level-5 gauntlet, and the cartridge is what settled it.
  - `$FF` returns from `sub_00_1DB9` at `$1DDE`, BEFORE the `$1E35` arm that
    snaps the Y low byte. The scan has already placed the player exactly; the
    snap would drag him to metatile alignment.

  Type `$08` has since been ported too (`jt_01_4525`), and with it the reason
  the arrival was already correct without a handler: level 3's slot 0 ships
  with `+$0B = $FE`, the retired state, so the platform never moves and is a
  plain static ledge. The moving one is slot 7, covered by `l3-platform-ride`.

- ~~Level 3 diverges at frame 358~~ - **closed, and it was a lag frame.** The
  port took a knockback the cartridge did not. Chasing `$C714` would have been
  the wrong thread: enemy 0's X actually diverges at **318**, where `$C757` is
  set - the only lag frame in the run, measured. The enemy driver skips that
  iteration, the cartridge's enemy stalls one step, and every later X sits 21
  world units behind the port's. 21 units is enough to put the enemy in contact
  range one frame early, which is the knockback at 357.

  This is instruction-level timing and out of scope by definition (§28), not a
  porting bug. `l3-object-floor` is now capped at **317** - one frame short of
  the lag - specifically so enemy fields can be compared as well. A longer run
  would only have passed by excluding them, which hides a divergence instead of
  bounding it.

---

## Hard-won lessons (the full list is docs/03-VERIFICATION.md)

- **Keep integer/byte math.** Terminal velocity is an *unsigned byte* compare
  that only works because falling velocities wrap into the high byte range.
  Floats silently break it.
- **When one field refuses to converge while everything around it is perfect,
  suspect the measurement.** The camera "bug" was the oracle sampling at the
  wrong point in the frame.
- **The disassembly can mislead.** `$1BA3` genuinely reads `XOR $01`, but that
  arm is not the one the walk path takes - believing it drew Batman mirrored
  for his entire run. Only the *pixel* comparison caught it; no state field is
  affected.
- **Banked addresses.** `LD HL,$41B8` is `1:$41B8`, not bank 0. Reading the
  wrong bank gave garbage that happened to be valid metasprite ids, so
  batarangs came out as spinning Batmen. (Kept on purpose as the Clone Wars
  mod.)
- **Animation counters are load-bearing**, not cosmetic - the enemy wall jump
  is fired by the *draw* path's animation expiry, so jumps are delayed while
  an enemy is off-window or blinking.
- **Reproduce quirks, don't fix them.** Ammo is spent before the free-slot
  search, so throwing with a full pool costs a batarang *and* punches.
- **Look at the running machine, not just the listing.** The exported level
  VRAM is a snapshot taken at level init, *before* the VRAM scripts that paint
  the water surface run. Trusting it said "the window is one flat black tile",
  and produced a black slab. Fourteen animated tiles were sitting there.
- **When a hook reads a register, hook the STORE, not the load that feeds it.**
  The sound recorder hooked `$431F`/`$4324` instead of `$4320`/`$4325`, so one
  value was attributed to two consecutive registers and every recording was
  quietly wrong. A bad oracle is worse than no oracle.
- **Never mark a mutable asset `immutable`.** `dist` served `/assets/*` with a
  one-year immutable cache while exporters rewrite those files in place. When
  `water.json` changed shape, browsers kept the old one and the water rendered
  as black squares - intermittently, depending on cache state. Assets now
  revalidate; if long caching is ever wanted, the URLs need a content hash.
- **Prefer a loud failure to a plausible-looking one.** That same bug looked
  like a *rendering* fault because the window layer painted its fill tile when
  it had no tilemap. It now draws nothing, and the loader throws.
- **A `--level` flag that does not reach the cartridge is a lie.**
  `checkmap.py` and `probecells.py` both took `--level` and used it only to
  pick which of OUR files to read - neither injected `$FFB0`, so the cartridge
  always booted level 1. `checkmap.py --level 3` therefore diffed our level-3
  export against level 1's `$D000` and reported 1707 bytes wrong. It sent this
  investigation chasing a non-existent map-export bug until level 5 and 9 -
  known bit-exact over 620 frames - also came back "wrong", which is what
  exposed the tool. Both now inject at `$04BB` like `trace.py`, and all maps
  are EXACT MATCH. When a trusted-good subject fails a new check, suspect the
  check.
- **Follow the label to where it *falls through*.** `$2418` and `$2423` read
  like return sites - set `$FFBA` and done. They are not: both fall into
  `loc_00_2426`, the map-object overlap scan. Stopping at the label is what
  left every map object in the port intangible.
- **A "constant" measured on one level may be a per-level value - and may not
  be a constant at all.** The `$FFB1` boot phase was measured on levels
  1/5/9/12 (all `$6D`) and adopted flat; under the oracle's boot path levels
  2/3/6/7/10/13 come up at `$53` instead, and nothing on a `$53` level read the
  counter until the enemy hit-blink did, drifting the landing animation by
  exactly the phase difference.

  But the second half of the lesson is sharper, and this bullet said it wrong
  for a while: `$FFB1` is not a per-LEVEL property, it is a per-BOOT-PATH one.
  Change how many frames the harness spends tapping START and every value moves
  - level 1 gives `$6D`, `$64`, `$74` or `$CB` under four different cadences,
  and the level-to-level delta is not stable either. `$FFA7` is 1 under our
  cadence and 0 under others. Adopting the oracle's phase is a defensible
  choice because it makes the corpus reproducible; calling it what the
  cartridge does is not. A free-running counter has no boot value to be right
  about.
- **A harness with no gate stage behind it is not a check.**
  `tools/oracle/headless.mjs` is the ONLY thing that drives `boot()` -- the rAF
  loop, the pacing accumulator, the canvas blit, the watchdog, the fail path and
  every screen hand-off. It had been dead since `c7a1e22` moved the integer
  upscale inside `boot()`, and nothing reported it because its one consumer,
  `flowpix.mjs`, is not a stage. Which means the whole host half of `main.js`
  had no automated cover at all. Repaired in Phase 10 and used to fingerprint
  1072 displayed frames before anything there was allowed to move. See
  `docs/03-VERIFICATION.md` §44.
- **A checker catches the one thing a test cannot: a comment that has drifted
  from its code.** `collision.js`'s `probe()` documented four return fields and
  has always returned six; five call sites read the two it denied. Nine of the
  twenty-eight baseline `tsc` errors were that one line, and no behavioural
  check could ever have seen it, because the CODE was right. In a project whose
  primary asset is its comments, a lying comment IS the defect. §45.

---

## Suggested next steps - BATMAN ONLY

**If you are picking the project up cold, this is not where to start.** The
standing priority is DaiOuJou and after that Gradius; `docs/worklog/ddpdoj/` and
`docs/worklog/gradius/` carry the live task lists and the open debts. What
follows is Batman's residue, and Batman is complete.

**Every task on Batman's original list is done, and so is everything found on
the way.** The items still open are listed under "What is NOT ported" above;
all of them are small and none blocks play.

Within Batman, the useful work left is not porting - it is
proving. Two of the last three real bugs were invisible to every memory
comparison in the suite and only appeared when someone rendered a frame or
drove the game. So:

1. **Extend pixel comparison beyond the two screens that have it.**
   `tools/oracle/introscreen.mjs` and `endingshot.mjs` are the worked examples;
   gameplay has nothing equivalent. A per-frame shade diff against PyBoy over a
   route playthrough would be the single highest-value harness left.
2. **Validate any check you add by making it fail.** Revert the fix, watch the
   check go red, restore. Checks in this project's history have sat green
   through the very bug they were written for in FOUR distinct ways - the four
   listed at the top of this file. This is not optional diligence; it is the
   difference between a test and a decoration.
3. **Re-run `tools/audit_coverage.py` after any porting wave.** It answers
   "what have we missed" with a number, and it is how the stage-intro screen
   was found after sitting unported *and* uncatalogued for the whole project.
   It currently reports no untouched region.

### Left open by the eleven-phase restructure, deliberately

Nothing is half-applied - every phase landed with its gate green - but three
things were scoped OUT with reasons, and they are the obvious next work:

4. **`tools/golden.mjs` fails 9 of its scenarios and has since before the
   restructure.** PROVED pre-existing, not caused by it: a worktree at
   `00cb076` with the same untracked goldens and assets copied in produces a
   BYTE-IDENTICAL failure list. It is not a gate stage. Do NOT re-record the
   goldens to make it green -- work out which of the 55 frames changed and why,
   then re-record deliberately. A re-baselined golden is a deleted bug report.
5. **`tools/oracle/flowpix.mjs` still is not a gate stage**, and it is now the
   only consumer of the repaired `bootHeadless`. §44 is the argument for
   promoting it: a harness nothing runs goes stale silently. Its part 1 (screen
   structure and shade histograms every frame) needs no cartridge.
6. **The fixed-timestep accumulator is still in `src/main.js`.** Moving it into
   `host/runtime.js` means inverting control -- the screen dispatch becomes a
   callback and four post-frame flags come back out -- and `host/runtime.js`'s
   header names the precondition: a harness that can advance the clock by an
   ARBITRARY delta, so `due(now)` can be asserted at 0, 1, 4 and
   4-after-a-missed-minute. Today's harness advances exactly one `FRAME_MS` per
   callback and would green-light a rewritten clamp it never exercises.
7. **`tools/oracle/punchreach.mjs` is broken at HEAD**, pre-existing:
   `makeState()` at :24 builds a state with no `effects` field. Not a gate
   stage. Untouched by the restructure, which was a move.

Known limits of that audit, so you do not over-trust it: its bare-`$XXXX`
citation rule is deliberately generous, and a routine the disassembler decodes
as DATA (no xref) is invisible to it - that is how `1:$4D74`'s once-per-game
max-HP latch hid, and it was eventually found by byte-scanning the ROM for
`$C754` accesses instead.

---

## Agent notes

Four recon agents mapped the ROM, a Fable agent consolidated it into
`docs/00-MASTER-REFERENCE.md`, three test agents built the suites, and a Fable
agent ported the enemy AI. Their raw reports are in `docs/recon-*.md` and
`docs/research-*.md` - historical, superseded by the master reference, but they
contain reasoning the summaries dropped.

One operational note: **tcrf.net served prompt-injection content** to an
automated fetch (instructions addressed to "LLMs and automated agents").
Verified at the byte level only as far as "something anomalous"; the specifics
were a summariser's paraphrase. Don't point unattended agents at it.
`datacrystal.tcrf.net` behaved normally.
