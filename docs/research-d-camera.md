# Research D — Where the player update is called from, and why the camera looked impure

Date: 2026-07-26. Tools: `tools/oracle/camorder.py`, `tools/oracle/camverify.py`
(both new, both kept). Verified live against PyBoy on three scripts
(`20:,130:R`, `20:,40:R,10:RA,50:R`, `15:,25:R,8:RA,20:R,10:A,30:L,12:LA,40:R,40:`).

## 1. The call chain to the player state machine

The player update is **the tail of `sub_00_1336`** — the main loop's `$05BD`
entry. It is not a CALL target at all, which is why searching for callers of
`$1600-$20B9` failed: execution *falls through* into it.

```
$0567 main loop
  -> $05BD  CALL sub_00_1336
       $1336-$1390   delayed tile restores   ($C67B x8)
       $1391-$1437   effect/pickup pool      ($C693 x10)
       $1438         [$C750] boss-mode? -> JP $1B4A (player, boss variant)
       $1444/$1445   ballistic objects x4    ($C6CF; loop closes at $1626)
       $1626-$1631   after slot 4, FALL THROUGH:
       $1632         [$C716] paused? -> (JP $1D0C draw-only if no scripted move) RET
       $1640         player entry: clear $FF96
       $1643-$1649   [$C737] scripted-move? nonzero -> $164A scripted path
       $1647         JP loc_00_170A          <- normal per-frame player update
       $170A-$1D0B   player state machine (input, walk, jump, gravity, probes)
       $1D0C         player draw (metasprite append)
       RET
```

Side doors into the same region (not per-frame): level transition
`$2820 ... $286A: JP loc_00_1776`; boss mode `$1438 -> JP $1B4A`.

Hook-verified order, every frame (camorder.py / camverify.py):

```
loopTop($0567) -> cam($121F) -> camDone($1332) -> mapObj(1:$4230)
  -> fx($1336) -> plEntry($1640) -> plNorm($170A)
  -> horiz($1EF9) -> grav($1A57) -> ceil($1EA6) -> $1B1B -> floor($1DB9)
  -> plDraw($1D0C) -> lvl($2CBE) -> tiles($2C13) -> batarang($3A35)
  -> enemy(1:$4E0C) -> vwait($0A4F) -> VBlank ISR($0653)
```

## 2. Intra-frame timeline (one unpaused loop iteration)

1. `$0567` HUD `$0F7B` + death `$29E7` (parity `$FFA7`==0 half only)
2. `$057D-$05AD` L9/A/B parallax counters + overlay `$0BC6`
3. `$05B0` pause check `$C716` — paused jumps to `$05D9`, skipping 4-7
4. `$05B7 CALL $121F` — **camera**: X `$121F-$1249`, Y `$124A-$1286`,
   column streaming `$1287-$1309`, SCX/SCY shadows `$130A-$1331`.
   **Reads `$FF81-$FF84` as left by the PREVIOUS iteration's player update.**
5. `$05BA CALL 1:$4230` — map objects (platform carry into `$C72F/$C730`)
6. `$05BD CALL $1336` — fx/ballistics, then **player update** (falls through):
   horizontal update + horizontal probe (`$1EF9`) FIRST, then vertical —
   gravity region (`$1A57`), ceiling (`$1EA6`), floor (`$1DB9`) — then
   player draw `$1D0C`
7. `$05C6-$05D6` `$2CBE` per-level, `$2C13` tile stream, `$3A35` batarangs,
   `1:$4E0C` enemies, `1:$4BB0` cond.
8. `$05D9-` parity==1 half of HUD/death; `1:$7AD3`; pause toggle
9. `$064A` `$0C1F` OAM clear; `$064D CALL $0A4F` **wait VBlank**; ISR `$0653`
   pushes OAM/SCX/SCY/joypad.

So: **(c) camera -> (a) player horizontal -> (b) player vertical -> (d) VBlank
wait.** The camera runs BEFORE the whole player update, every frame, and the
player draw (`$1D0C`, via `sub_00_1172` world->screen) uses the camera value
computed *this* iteration — i.e. the visible camera genuinely lags the player
by one frame on real hardware.

## 3. Writers of $FFA2-$FFA5 (whole ROM)

Grep of all 8 disassembly banks for `$FFA2-$FFA5`: writes happen only through
pointers loaded at these four sites:

| site | routine | when |
|---|---|---|
| `$1225` / `$124A` | `sub_00_121F` | every unpaused frame (`$05B7`) |
| `$1054` / `$107B` | `sub_00_104E` | level init (`$0557`) and level transition (`$2845`, from `$2820`) — the `$F0`-masked `SUB $15` variant |

Everything else is a read: `$10A2/$10B6/$130A/$131E` (SCX/SCY derivation),
`$1172` (world->screen), `$11A7` (enemy activation), `$128A/$129B/$12F7`
(streaming), `$2E3E/$2E5B` (water surface), `$2FBA`, `1:$425D`, `1:$5CC1`,
`1:$60A0`, `1:$60BC`. The VBlank/STAT/Timer ISRs never touch them.

Proven functionally by camverify.py: sampling at the stable `$0A4F` hook,
`cam_N == 121F_model(pos_{N-1})` held **100%** — 149/149, 119/119, 199/199
iterations on the three scripts. No hidden writer, no straddling.

## 4. Is $121F ever called twice, or skipped?

- Exactly **once per loop iteration** (hook counts: one `cam` per `loopTop`,
  every iteration, all runs).
- **Skipped when paused** (`$05B4 -> $05D9`) — but the player update is
  skipped too (`$1632` returns), so pause keeps them consistent.
- A **second camera write** happens only on level-transition frames, by
  `$104E` (different formula) inside `$2820`, after `$121F` already ran.
- No lag-frame double execution observed (1:1 loop iterations to ticks in all
  runs; `$C757` never tripped).

## 5. Root cause of the "sometimes previous, sometimes current" measurement

**It is an oracle sampling artifact, not game behavior.** `trace.py` samples
HRAM at the PyBoy tick boundary. The main loop body starts inside VBlank, so
the tick boundary (end of VBlank) slices the loop mid-head — usually between
`1:$4230` and `$1336`, i.e. AFTER the *next* iteration's `$121F` has already
run. Measured with camorder.py over 150 frames: the camera value present at
the tick boundary reflected the **current** tick's end-of-frame player x on 94
frames, the **previous** tick's on 14 (boundary jitter from IRQ timing), and
the remaining ticks contained 0 or 2 camera executions purely because of where
the slice fell. That wandering slice is exactly the 92.7%/72.7% impurity.

## 6. The fix

Two coupled changes (one in src/, one in the oracle):

**(a) `src/main.js tick()` — move the camera to the top, matching `$0567`:**

```js
state.video.sprites.length = 0;       // $0C1F
updateCamera(state);                  // $05B7 $121F -- reads LAST frame's pos
// (1:$4230 map objects go here when implemented)
updatePlayer(state);                  // $05BD tail of $1336
applyAnimHitbox(state, manifest);
drawPlayer(state, manifest);          // $1D0C -- uses THIS frame's camera
streamPlayerTiles(state, manifest, playerTiles);  // $2C13 (after player, $05C9)
```

(`drawPlayer` after the reorder automatically uses the camera computed from
the previous frame's position — which is what the real game displays.)

**(b) `tools/oracle/trace.py` — sample at a stable loop-phase point.** Register
a hook at `$0A4F` (gated on gameplay having started) that snapshots the state
vector; after each `tick()`, emit the snapshot instead of reading memory at
the tick boundary. At that point `x,y,...` are this iteration's post-update
values and `camX/camY` are this iteration's `$121F` output = f(previous pos) —
exactly the pair the reordered JS produces. Player fields are unaffected
(identical at `$0A4F` and the boundary in all runs), so the existing 100%
fields stay 100%.

With (a)+(b), camX/camY should verify at 100% (the model already does,
§3). Leaving trace.py sampling at tick boundaries makes 100% impossible for
ANY JS ordering — the slice point is not deterministic.

Caveats:
- Level-transition frames write the camera again via `$104E` (masked
  variant) — already translated separately per src/camera.js's note; the
  transition path re-enters player code at `$1776`.
- On platform levels, `1:$4230` runs between camera and player; if it ever
  writes `$FF81-84` directly (rather than via `$C72F/$C730` consumed by the
  player), the JS map-object update must also sit between them.
  UNCONFIRMED — settle with a `$FF81-84` write-watch on a platform level
  when map objects are implemented.
