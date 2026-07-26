# 02 — MOD SYSTEM & SELECTION SCREEN

Premise: we own the JS source, so mods are **not byte patches**. A mod is a
declarative config over a well-defined parameter surface, plus (optionally)
hook functions and asset overrides. ROM addresses below are provenance only —
they tell you which extracted constant/record a key controls.

---

## 1. ARCHITECTURE

Three layers, applied in this order at boot:

1. **Params** — key/value overrides of the `tunables` registry (generated
   from master-ref §10). Purely declarative, trivially stackable.
2. **Data overrides** — replacement/transformation of extracted asset data
   (spawn records, level order/exit graph, palettes, metasprite ids). Either
   literal JSON or a seeded transform function (randomizers).
3. **Hooks** — functions registered on named engine events for behaviour that
   isn't a constant. Hooks run in mod-stack order; each receives a context it
   may mutate and the return of the previous hook.

### Mod schema (`mods/<id>.js`, an ES module)

```js
export default {
  id: "moon-gravity",
  name: "Moon Gravity",
  blurb: "One small step for Bat...",
  category: "physics",            // physics | combat | progression | chaos | assist
  version: 1,
  conflictsWith: [],              // explicit ids; implicit = overlapping param keys
  stackable: true,                // may combine with other mods
  seedable: false,                // shows a seed field in the launcher

  params: {                       // layer 1 — flat dot-keys into tunables
    "player.gravityRisingHeld": 0,
    "player.gravityFalling": 1,
    "player.terminalVelocity": -32,
  },

  data: (assets, seed) => assets, // layer 2 — pure transform, optional

  hooks: {                        // layer 3 — optional
    onBoot(state) {},             // after state init, before title
    onLevelInit(state, level) {},
    onFrame(state) {},            // main-loop head (≈ $0567)
    onPlayerTick(state, player) {},
    onEnemySpawn(state, enemy) {},          // may edit or veto
    onDamagePlayer(ctx) {},                 // {amount, source} — mutate amount
    onDamageEnemy(ctx) {},
    onPickup(ctx) {},
    onLevelExit(ctx) {},                    // {from, edge, to} — mutate to
    onRenderFrame(ctx) {},                  // palette/theme, post-effects
    onSoundRequest(ctx) {},                 // {id, mask} — mutate/veto
  },
};
```

### Application & stacking rules

* The launcher builds a `ModConfig = {mods: [ids...], seed, difficulty,
  route}` and boots the game with it; nothing is patched after boot except
  through hooks. Config round-trips through the URL hash
  (`#mods=moon-gravity+boss-rush&seed=1234`) and localStorage.
* Params: **last mod in stack order wins** per key. The launcher shows a
  conflict badge when two selected mods touch the same key and lets the user
  reorder the stack.
* Data transforms compose in stack order (each receives the previous output).
* `stackable: false` mods (total-conversion tier, e.g. Boss Rush) occupy an
  exclusive "mode" slot; the launcher enforces one at a time, but modifier
  mods still stack on top of a mode.
* Engine discipline that makes this work (enforced from Phase 1 of the port):
  gameplay code reads every constant through `tunables.get()`, and the listed
  hook points are real call sites in the engine, not an afterthought.

---

## 2. TUNABLE PARAMETER SURFACE (v1)

Generated as `constants/tunables.js`; keys below are the stable public API.

| group | keys (ROM provenance in master-ref §10) |
|---|---|
| `player.*` | jumpVelocity, springJumpVelocity, wallJumpVelocityX/Y, gravityRisingHeld, gravityRisingReleased, gravityFalling, terminalVelocity, walkSpeedMax, waterSpeedMax, waterGravity, waterTerminal, decelStep, turnAroundFrames, landingSquatFrames, wallClingFrames, hitboxHalfW/H, knockbackX/Y, ropeSegments, batarangSpeed, batarangPoolSize, attackCooldown |
| `health.*` | startingMaxHP, maxHPCap, startingLives, invulnFrames, deathSequenceFrames |
| `damage.*` | melee, batarang, critWindow, objectContact, spike, waterDrain, enemyContactByState[13], levelBonus[14], enemyStunFrames |
| `pickups.*` | energyAmount, batarangAmount, maxHPAmount |
| `enemies.*` | activationRange, despawnRange, hpScale, speedScale, per-record overrides via data layer |
| `bosses.*` | hp[4], hpBonusHard, projectileSpeedScale |
| `camera.*` | leadX, clampLeft, yWindow[4] |
| `world.*` | deathPitRow, levelExits (data), routeEntryLevels, startingLevel |
| `render.*` | palette theme, bgp/obp0/obp1 base, invert, cycleSpeed |
| `sound.*` | tickHz (59.36 — the "tempo"), sfxEnabled, musicTable[14] |
| `meta.*` | gameSpeed (ticks per rAF), difficulty lock, assistFlags |

---

## 3. LAUNCH LINEUP — 18 curated mods

Selection criteria: dramatic to play ÷ cheap to build, spread across
categories. Cost: ● trivial (params only) ◐ small hook ◼ data/logic work.

### Physics (stackable)
| mod | pitch | implementation |
|---|---|---|
| **Moon Gravity** ● | Float like a bat, land like a feather. | `player.gravity* → 0/1/1`, `terminalVelocity → −32` |
| **Super Jump** ● | Clear buildings in a single bound. | `jumpVelocity $22→$3A`, spring + wallJumpY scaled |
| **Ice Physics** ● | Gotham froze over. No traction. | `decelStep → 0`, accel halved via `walkAccelScale` |
| **Turbo Mode** ◐ | Everything at 1.5×. Everything. | `meta.gameSpeed`: run 3 logic ticks per 2 frames (sound tick untouched) |
| **Grounded** ◐ | The jump button is a lie. Rope and wall-cling only. | `onPlayerTick`: swallow A-press jump (leave wall-jump), i.e. the JS twin of patching `0:$1A2D` |

### Combat (stackable)
| mod | pitch | implementation |
|---|---|---|
| **One-Punch Bat** ● | Every hit is a critical. | `damage.critWindow → 256` (uses the real crit path: enemy's full HP, crit SFX `$18`) |
| **Batarang Storm** ● | Infinite ammo, no cooldown, more in the air. | `onPickup`/`onBoot` set ammo ∞ (skip decrement), `attackCooldown → 1`, `batarangPoolSize → 6` |
| **Brutal Gotham** ● | Every touch hurts. A lot. And no mercy frames. | `damage.enemyContactByState → 4s`, `spike → 8`, `invulnFrames → 8` |
| **Glass Cannon** ● | 1 HP. Punches kill instantly. Good luck. | `startingMaxHP → 1` + One-Punch params |
| **Tank Batman** ● | Start with the full 16-heart bar. | `startingMaxHP → 16` (HUD already supports it) |

### Progression (mode slot, exclusive)
| mod | pitch | implementation |
|---|---|---|
| **Free Roam** ◐ | All 14 levels on the select screen from the start. | launcher passes route/level directly; `onBoot` sets `flow.routeMask` + start level — the JS twin of forcing `$C753` |
| **Boss Rush** ◼ | Four bosses. Nothing in between. | data: `world.levelExits` rewritten 4→8→11→14; route dispatch neutralised via `onLevelExit` |
| **Gotham Shuffle** ◼ (seedable) | The routes are randomized. So are the enemies. | data transform: permute level exits within routes + shuffle enemy `state` fields (with matched HP/hitbox from the roster table); seed shown on screen |
| **One Life** ● | No continues. No second chances. | `startingLives → 1`, `onBoot` disables continue flag |

### Chaos & assist (stackable)
| mod | pitch | implementation |
|---|---|---|
| **Aggro Mode** ● | Every enemy on the map wakes up angry. | `enemies.activationRange 7→$40`, `despawnRange → $50` |
| **Noir Gotham** ● | The whole game in photo-negative. | `render.invert = true` (palette LUT inversion at compose time) |
| **Disco Gotham** ◐ | The palette strobes to the frame counter. | `onRenderFrame`: rotate BGP shades every 8 frames (the raster machine already proves it looks great) |
| **Robin Protocol** ◐ | The hidden rescue drone, always on call. | force `$C75C`-equivalent flag = 1; relax the HP<3 gate via param — surfaces real cut content |
| **Speedrun HUD** ◐ | Frame-exact IGT and level splits on screen. | `onFrame` counter + `onLevelExit` split log, drawn via the font tiles (`$80-$89`) |

(Deliberately cut from launch: Mirror Mode and Custom Level Geometry — high
cost; ship as v2 once the level JSON editor exists. All 40 catalogued ideas
remain in `recon-5` §7 as backlog.)

---

## 4. SELECTION SCREEN

Where: the launcher page (`index.html`) shown before the game boots, styled
like a Gotham case-file board; it is NOT inside the game loop.

Layout & flow:

1. **Header**: game title, theme picker (DMG green / pea-soup / noir).
2. **Mode row** (exclusive pick, radio-style large cards): *Original*,
   Free Roam, Boss Rush, Gotham Shuffle, One Life. Shows a seed input when
   the mode is seedable.
3. **Modifier grid** (multi-select toggle cards, grouped by category tabs
   Physics / Combat / Chaos / Assist): each card = name, one-line pitch, small
   icon, and on hover/selection an exact-effects panel (the actual param diff,
   e.g. "gravity 3 → 1, terminal −66 → −32") — the parameter surface doubles
   as honest documentation.
4. **Stack tray**: selected mods in applied order, drag to reorder; conflict
   badge (⚠ shared keys) with "last wins" explanation. Live count of touched
   params.
5. **Difficulty + route** selectors (mirrors the in-game options so runs can
   start instantly).
6. **LAUNCH** → builds `ModConfig`, writes URL hash + localStorage, boots the
   game canvas fullscreen. In-game pause menu gets "Back to mod select".
7. Share: the URL hash IS the loadout — copy to share exact runs (seed
   included).

Combination policy (final): modifiers stack freely (params: last-in-wins,
hooks: chain), one mode at a time, and a curated few **featured presets**
("Nightmare Run" = Brutal + One Life + Aggro; "Power Fantasy" = Super Jump +
One-Punch + Batarang Storm) shown as one-click cards at the top of the grid.

Persistence: last loadout + per-mode best times (feeds Speedrun HUD splits)
in localStorage.
