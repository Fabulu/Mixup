# Wave 41 IMPLEMENTER - Gradius mods, the start screen, and Batman parity

status: DONE
implementer, 2026-08-04

Brief: bring Gradius to Batman parity - a start screen and a mod system -
WITHOUT touching the port's fidelity. Four mods named by the owner (full
power-ups, respawn in place, level select, starting power-up picker), two named
later by the owner (**Heal Gradius Syndrome**, **Always on enemies**), and
"go ham".

**Gate before: GREEN - 12 passed, 0 failed, 0 SKIPPED.
Gate after: GREEN - 12 passed, 0 failed, 0 SKIPPED.** Same twelve stages,
including `stagesweep` and `rendergate`. Unit tests 682 → 723.

---

## §0. THE ONE RULE, AND WHY IT IS THE WHOLE DESIGN

The port's agreement with the cartridge is the product. So the mod layer is
built on one invariant, stated at the top of `src/mods.js`:

> **`state.mods` is UNDEFINED on every state `createState()` ever made.**

There is no "mods off" code path. There is the ABSENCE of an object. Every hook
is called from `src/` behind `if (state.mods)`, and `attachMods()` refuses to
attach when nothing was chosen - including the case that actually bit (§6.1):
a picker left at all-zeros.

Five call sites inside the simulation, countable with one grep
(`grep -n 'state.mods' games/gradius/src/*.js`):

| file | hook | where |
|---|---|---|
| `src/nmi.js` | `modHidePlayer` / `modShowPlayer` | around `$80A7`'s `JSR $8B10` |
| `src/nmi.js` | `modFreezeEnemies` | around `$9A6D`'s `JSR $ADAB` |
| `src/nmi.js` | `modFrameEnd` | after `$80B5`'s `STA $04` |
| `src/flow.js` | `modAfterIntroReset` | the tail of `$9B3E` |
| `src/collision.js` | `modRefuseDeath` | the top of `$C1D6` |

...plus `src/main.js`, which is the HOST, not the simulation: the input word,
the frame period, and the framebuffer.

Four tests hold the rule, including the blunt one - 120 unmodded frames of
`nmi()` must leave `state.mods` undefined, so a call site that ever CREATES the
object instead of testing for it goes red.

## §0a. WHY A FRONT END AND NOT AN OVERLAY (the brief asked)

**Before the cartridge boots.** W39 ported the cartridge's own title, attract
demo and start jingle, so the question was real. Three reasons, in weight order:

1. **Half the catalogue has to be resolved before the first NMI.** Level select
   writes `$26,X` and loop select writes `$28,X`, and `$9B6E`/`$9B72` read both
   INSIDE the first `$9B3E`. An overlay opened during play is already past them.
2. **START and SELECT belong to the cartridge now.** `$821A` consumes both on
   every mode-0/1/2 frame; an overlay would fight mode 1 for the two buttons a
   player reaches for.
3. **It is what makes the ONE RULE checkable.** With the menu outside the frame
   loop, "mods off" is not a branch to audit - it is an object that does not
   exist.

The cartridge's own title is not replaced; it is entry 0 of the level list.
Verified in a browser: `index.html` with an empty hash reaches game mode 2, the
attract demo, with `state.mods === undefined` (§5).

---

## §1. THE FOUR REQUIRED MODS

### 1. `full-power` - **Full Kit, One Speed**
Writes the six power-up bytes `$9B3E`'s `LDX #$5A / STA $3D,X` wipe:

```
$40 = 1   speed -- ONE, as the owner asked
$41 = 1   missile
$42 = 6   the meter cursor, parked on ?/SHIELD
$44 = 2   DOUBLE ($89BB stores 2; $89CF stores 1 for LASER -- measured, W6)
$45 = 2   both Options ($89D5's cap)
$46 = 5   the shield at full ($8997's grant)
```

At the **tail of `$9B3E`**, which is the boot intro AND every respawn AND
`$97DD`'s continue - one hook, every path, because the ROM funnels all of them
through the same routine. Nothing bypasses the game's logic: `$9C45` recomputes
the rank from these, `$8A22` draws the meter cell, `$A108` fires from `$45`,
`$8B6B` draws the shield's force field.

A pleasant consequence, measured rather than designed: `$42 = 6` with `$46`
non-zero takes `$8999 BNE $8983`, the "already owned" refusal, which **keeps**
`$42`. So the bar sits on the shield cell instead of being eaten the first time
the player touches B.

### 2. `heal-gradius-syndrome` - **Heal Gradius Syndrome**
Respawn where you died; blink; touch nothing for 180 frames.

**THE CARTRIDGE HAS NO PLAYER INVULNERABILITY.** Grepped and read: the two
`BPL`s at `$C011` and `$C055` that look like one are bit 7 of `$030C,X`, the
ENEMY's spawn-frame guard, and the player's only defence anywhere in the PRG is
`$46` - which `$C2A5`'s terrain probe does not consult at all. So the window is
BUILT, and it is built at `$C1D6`, the single point all four death routes
converge on (`$C101` contact, `$C247` bullet, `$C290` arm segment, `$C2C1`
terrain). One guard, nothing half-applied.

The blink is the game's own encoding, not a renderer trick: `$8B10` draws object
0 only when `$0120` is non-zero (the same fact `$82A1` uses to park the menu
cursor). `$0120` is zeroed across `JSR $8B10` and restored immediately, so
`$A0BE`'s tilt latch never sees the zero.

**`$24,X` IS DELIBERATELY LEFT ALONE, and that is a correction to my own first
draft.** Writing the real camera into the checkpoint byte and letting `$9B68` do
the work is the obvious design and it is wrong: `$9B88` indexes the start
position table at `$9BD4` with `$9BCC[$19] + ($3F >> 1)`, whose domain is
exactly the five checkpoint values, so a larger `$24,X` reads off the end of a
ROM table to compute a position the hook then overwrites. Worse, the mutation
test caught it - setting `$24,X = 0` changed **no test**, i.e. the write was
already dead. It was deleted, along with its call site: six hooks became five.

What it does instead: after the intro has finished, put `$3F`/`$55` and
`$0360`/`$0320` and both `$07A0`/`$07C0` rings back where the ship fell. The
camera low bytes stay 0, which is the same shape `$9B3E` gives a checkpoint
respawn (`$3E`/`$54` are inside the wipe, lead 0), so the return quantises to
256 px instead of the checkpoint's 512 - and, unlike `$97BB`, it is not capped
at 8.

### 3. Level select - all seven stages
Through `$26,X`, seeded before the first NMI; `$9B6E LDA $26,X / STA $19` is
what actually sets the stage. **Applied ONCE, not per intro** - re-applying it
at every `$9B3E` would undo `$96CF`'s `INC $19` and drag the player back to the
chosen stage after every death. There is a test for exactly that trap.

`res.stages[state.zp19]` has been the runtime's terrain source since W27, so
nothing else needed changing. Browser-verified for stages 3, 5 and 7 (`$19` = 2,
4, 6, no throws).

### 4. The starting power-up picker
`game.json`'s `options[]`, the same mechanism Batman's difficulty select uses,
carrying the six bytes above with the ROM address and the measurement in each
`note`. Lands on the FIRST intro only, because that is what "what you start
with" means. `muscle-memory` (**Muscle Memory**) makes it sticky across
respawns; `full-power` overrides it.

---

## §2. GOING HAM - the rest of the catalogue

**physics / host** - `turbo` (Turbo Mode, 2 logic frames per displayed frame),
`bullet-time` (1 in 3), `mirror` (Mirror Gradius - picture flipped and `$0007`'s
LEFT/RIGHT bits swapped so your thumbs still work), `upside-down`
(Gradius Down Under).

**combat** - `full-power`, `heal-gradius-syndrome`, `muscle-memory`,
`immortal` (Cannot Be Killed, Only Embarrassed), `rank-zero` (Career Rookie,
`$17` pinned at 0), `rank-max` (Overqualified, `$17` pinned at 6 - a value stage
1 cannot reach by playing), `loop-three` (Third Time Unlucky, `$1A = 2` via
`$28,X`; W38 measured loops 2, 3 and 6 frame-identical, so this IS the hardest
the cartridge can be), `overtime` (Overtime Pay), `stay-calm` (Everyone Stay
Calm - `$ADAB` does not run, so enemies spawn, aim and shoot without moving).

**chaos** - `always-on-enemies`, `gameboy` (Gradius for Game Boy - four DMG
greens), `negative`, `disco` (Disco Vipers), `afterimage`, `hitboxes`
(X Marks The Viper).

Presets: The Owner's Run, Nightmare Fuel, Sightseeing Tour, Wrong Console Wrong
Way Up.

### `always-on-enemies` - **Always on enemies** (the owner's spec, honoured)

**It is the renderer's OWN switch, not new code.** `renderFrame` has carried
`const sprLimit = breaks.has('sprlimit') ? 64 : 8` since the hardware rules were
written - one of the deliberate corruptions the gate uses to prove the
comparison can go red. The mod holds that switch down. With the mod off,
`src/main.js` calls `renderFrame` with its DEFAULT argument, which is the exact
call `rendergate` makes; `rendergate` is GREEN after this wave.

The distinction the owner drew is honoured structurally, not by special-casing:

* **Hardware-limit drops stop.** The cap is the only thing lifted.
* **Deliberate blinks keep blinking.** Everything the game chooses not to draw
  is simulation-side - `$0120 = 0` - and the render layer never sees a decision,
  only a display list. This wave's own respawn flicker works that way too, so it
  survives the mod (both on together were played).
* **The game's rotation is left alone.** Gradius DOES rotate: `$8B39
  LDA $2F / CLC / ADC #$44` moves every sprite 17 OAM slots a frame so a
  different eight survive (`src/oam.js rotateBase`, confirmed by arithmetic on a
  captured frame in W2). That is the cartridge sharing the drops around, and
  with the cap lifted it is simply harmless.

---

## §3. WHAT THE BRIEF GOT WRONG, OR WHAT IS NOT POSSIBLE

The brief asked for its premise to be checked. Four items:

1. **"Infinite options ... if the option code tolerates it" - IT DOES NOT, and
   the listing says so.** `$89D5 CMP #$02 / BCS` is the only bound in the
   cartridge, but `$A108 LDX $45 ... DEX / BPL` walks OBJECT SLOTS `0..$45`, and
   slots 3-5 are SHOT A (`src/state.js`'s slot map). `$45 = 3` therefore fires
   the player's weapon out of a shot slot, and `$A0C8`'s animation loop writes
   `$0121,X` over the same slots. `src/weapons.js` already throws on the range.
   A third Option needs object slots that do not exist - a parallel system, i.e.
   exactly the kind of lie this repo does not ship. The mod layer clamps `$45`
   to 2 and says why in the code.

2. **"`$98` ... the enemy fire-rate countdown" - half right, and the useful half
   is a different byte.** `$98` is the per-frame SUBTRACT that `$BBBD`'s ladder
   computes (`$BBEC STY $98`); the COUNTDOWN is `$040C,X`, which `$BBFD`
   subtracts from. Poking `$98` would do nothing anyway: three other routines
   reuse it as scratch inside the same frame (`$A2E6`'s pointer, `$A356`'s
   command arithmetic, `$BC93`'s dx). `overtime` drives `$040C,X`.
   Note the rate ceiling is structural: `$BC0F` LEAVES the loop as soon as one
   enemy borrows, so at most one enemy can fire per frame however low the
   counters are. The mod zeroes ONE slot per frame, rotating - the maximum the
   cartridge's own loop shape allows.

3. **"Moai everywhere" - checked and rejected, not skipped.** `$A46F` is reached
   only from `inline5Arm` behind `$19 == 2`, and the moai has no wave-record type
   of its own: its identity is a NAMETABLE ADDRESS the stage-3 record carries in
   `$66`/`$67`, stored to `$03BC,X`/`$03EC,X` and used by `moaiQueue` as a VRAM
   destination. Forcing the arm on another stage feeds that queue an address
   built from bytes that mean something else - an arbitrary `$2007` write, which
   is not silly, just corrupt. Stage 3 is one click away in the level list and
   has all the moai anybody needs.

4. **"Use the cartridge's own invulnerability/flicker if it has one" - it has
   none.** See §1.2. Built honestly and labelled as built.

---

## §4. EVERY CHECK SEEN TO FAIL

`games/gradius/tests/mods.test.js`, 41 tests. Each mutation below was applied to
`src/mods.js` alone, the suite run, the file restored from a copy, and the SHA-1
compared - **restored byte-identical, verified**.

| mutation | tests that went RED |
|---|---|
| drop `$46` from `applyKit` | Full Kit writes all six · survives the death · meter cursor · beats the picker |
| `state.cam.hi = 0` instead of `d.camHi` | respawns where you died · the composition test |
| delete the ship/ring restore | respawns where you died · the composition test |
| `if (false) return true` in `modRefuseDeath` | the invulnerability window refuses every death route |
| always `return -1` from `modHidePlayer` | the ship flickers while invulnerable |
| delete the `$26,X` seed | level select goes through `$26,X` · does not drag you back |
| delete the `$28,X` seed | loop select goes through `$28,X` |
| `modRenderBreaks` returns `undefined` | Always on enemies is the renderer's own sprlimit break |
| delete the rank lock | rank lock pins `$17` · rank lock survives a whole frame |
| delete the `$040C,X` zero | Overtime Pay zeroes one countdown per frame |
| delete the immortal arm | Cannot Be Killed refuses `$C1D6` forever |
| `modFreezeEnemies` returns `false` | Everyone Stay Calm (both) |
| delete the LEFT/RIGHT swap | Mirror and Down Under swap two bits · a swapped word reaches the frame |
| `if (rt.firstIntro)` only | Full Kit survives the death · Muscle Memory · the composition test |

**One mutation changed nothing, and that was the finding**: `state.save24[p] =
0`. It exposed the dead `$24,X` write described in §1.2, which was then deleted
along with its call site.

Two of the tests are executed against the real machinery rather than asserted
about a flag:
* *"Always on enemies really does draw the 9th sprite"* puts ten sprites on one
  scanline and calls the actual `renderFrame` twice: 8 × 8 lit pixels capped,
  10 × 8 lifted.
* *"render mods cannot reach the simulation"* runs 100 frames with all six
  render mods on and 100 with none, and compares the whole `$0300` page, the
  palette, `$17` and the camera.

---

## §5. THE BROWSER (Chrome 150, headless, driven over CDP)

Six documents in this repo claim there is no browser here. There is: Chrome and
Edge are installed and a Playwright chromium cache exists. The `playwright` npm
package does not, and Node 20 has no global `WebSocket`, so the driver for this
wave is ~110 lines of RFC6455 over `node:http` speaking DevTools Protocol
(scratchpad only - nothing added to the repo).

**Chrome's `--screenshot` / `--dump-dom` CLI modes hang forever on
`games/gradius/index.html`** while working fine on `start.html`. Not chased; CDP
works, and the note is here so the next person does not lose the same hour.

`index.html` now exposes `globalThis.__gradius = app` - the same handle Batman's
launcher gives as `window.game`. Nothing in `src/` reads it.

What was SEEN:

* **bare page, empty hash** → game mode 2 (the attract demo), `state.mods`
  **undefined**, mod line empty. W39's boot path is untouched.
* **Full Kit** → two Options trailing the ship, DOUBLE fire, the shield's force
  field drawn around the hull, the power bar lit through OPTION.
  `$40=1 $41=1 $44=2 $45=2 $46=5`.
* **Level select** → `level=3/5/7` gave `$19 = 2/4/6`, no throws, correct
  stage art and enemies (stage 7's fortress sprites screenshotted).
* **Heal Gradius Syndrome, the A/B.** Same 45 s of holding RIGHT with autofire,
  four deaths each:
  * stock → died at `x = 240`, came back at `x = 80` (the `$9BD4` table)
  * modded → died at `x = 238/240`, came back at `x = 240`, `invuln` counting
    down from 180
* **Heal Gradius Syndrome, the camera.** An in-page watcher recorded `rt.death`
  at `$C1D6` and the state at the end of the intro. Sitting still with Full Kit
  until the camera reached high byte 5, then flying into the floor:
  ```
  died (x=80,y=189,cam=5) -> back (x=80,y=189,cam=5,build=5)  EXACT   x4
  ```
  A stock death there goes back to `min(5 AND $0E, 8) = 4`.
* **THE COMPOSITION** (§7) - both on together, four respawns, all EXACT with
  `shield=5 options=2 weapon=2 speed=1 missile=1` restored each time.
* **Always on enemies, the A/B on ONE frame.** Rendering the SAME
  `frameFor(state)` twice with and without the break: **181 differing pixels**
  with 30 live OAM slots. Capped, the third fan of a trio is half-drawn and an
  Option beside the ship is missing; lifted, everything is there.
  (`sprlimit-off.png` / `sprlimit-on.png`.)
* **start.html → LAUNCH** end to end: two cards clicked, stage set to 3, shield
  set - hash written, `index.html` reached, `mods = ["full-power",
  "heal-gradius-syndrome"]`, `$19 = 2`, shield live.
* Screenshots taken of Game Boy, Disco, Mirror, Negative, Afterimage, Down
  Under, X Marks The Viper, stage 3 and stage 7. All clean, no thrown paths.

---

## §6. DEFECTS FOUND, BOTH IN THE BROWSER AND NEITHER BY A TEST

### 6.1 A picker at its defaults attached a mods object
`resolveLoadout` treated a picker value of `0` as a real choice, so LAUNCH with
nothing selected produced `zp = {$40:0 ... $46:0}`, `anyStart = true`, and
`attachMods` attached. Numerically a no-op - every one of those bytes is already
0 after `$9B3E`'s wipe - but it violates the ONE RULE, which is the only thing
protecting the gate. **Zero now means "leave it to the cartridge".** Pinned by a
test that resolves the exact object `start.html` hands over.

### 6.2 `mods=a+b` in a URL is `"a b"`, and two mods became none
A `+` in a query string is an encoded space; `URLSearchParams.get()` decodes it.
Splitting on `'+'` alone yielded ONE unknown id, which `resolveLoadout` then
dropped - so **a two-mod link launched vanilla, silently.** Found by reading
`state.mods` in the browser and seeing `null` for
`#mods=rank-max+loop-three&level=1`. Both `index.html` and `hashToLoadout` now
split on `/[+\s]+/`, and there is a test.

*(Batman's `mods.js` has the same `split('+')`. It has never bitten there because
its launcher passes the id array directly and only reads the hash on the picker
screen. Not touched from this wave - different owner - but written down here.)*

---

## §7. THE COMPOSITION, AS ASKED

Full Kit + Heal Gradius Syndrome is coherent, and the interaction is the good
kind:

* they touch **disjoint state** - one writes `$40/$41/$42/$44/$45/$46`, the
  other writes `$3F/$55/$0360/$0320` and the rings. `resolveLoadout` reports
  `conflicts.size === 0`, asserted.
* order is FIXED in `modAfterIntroReset` (position, then kit, then the blink) so
  the composition is deterministic rather than incidental.
* the one real interaction is that **while you are blinking you cannot die**, so
  the 180 frames are genuinely a window and not a cosmetic. In the browser the
  window had to be burnt off before a second death could be provoked.
* it still costs a life. `$979F DEC $20,X` runs; this is not `immortal`.

Together they are exactly the run the owner described: you die, you come back
where you fell with everything, you blink for three seconds, and you get out of
the way.

---

## §8. FILES

| file | what |
|---|---|
| `games/gradius/src/mods.js` | NEW - the catalogue and every hook |
| `games/gradius/src/nmi.js` | 3 guarded call sites |
| `games/gradius/src/flow.js` | 1 guarded call site |
| `games/gradius/src/collision.js` | 1 guarded call site |
| `games/gradius/src/main.js` | host: loadout, pacing, input word, framebuffer |
| `games/gradius/start.html` | NEW - the start screen |
| `games/gradius/index.html` | reads the hash, links back, exposes `__gradius` |
| `games/gradius/game.json` | `code.mods`/`code.input`, `entries[]`, `options[]` |
| `games/gradius/tests/mods.test.js` | NEW - 41 tests |

`game.json`'s `code.entry` STAYS NULL, and the manifest says why: the repo
launcher's play stage is Batman-shaped (its key hints name walking and jumping,
and it opens no AudioContext), so driving Gradius through it would cost the
player the sound W8/W13 exist to produce. `code.mods` is filled in, so the day
the launcher grows an audio channel and per-game key hints, setting `entry` is
the only change needed.

## §9. LEFT UNDONE

* **Big/tiny ship.** Would need metasprite scaling in `$8AAC`'s expander; the
  hitbox tables are per-type and one-sided (`$C12C`'s unsigned-wrap idiom), so a
  scaled sprite and an unscaled box would be a lie in a game that is all about
  the box. Batman shipped Wide Load with exactly that caveat; here it is worse,
  because Gradius's whole difficulty is the hitbox.
* **An on-canvas debug HUD** showing `$17`/scroll/`$1B`. Drawing text on the
  canvas needs a font this port does not own, and the page's `#stats` line
  already carries the camera, `$0120` and the lag counter - the missing ones
  (`$17`, `$1B`) are two more fields on that line whenever somebody wants them,
  and `globalThis.__gradius` reads them today from a console.
* **Two-player anything.** `$18 != 0` throws all over `src/`, by design.
