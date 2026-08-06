# Wave 26 IMPLEMENTER - the boss

status: DONE
implementer, 2026-08-02/03

Scope (from the W26 brief + `26-recon-boss.md`): port the boss head `$B914` +
inert body `$B913`, the morph/rank/movement/fire machinery, and the death chain,
so the endchain scenario compares green THROUGH the boss fight + death instead
of throwing at `$B914 @ f8252`.

Read the recon FIRST: `docs/worklog/gradius/26-recon-boss.md`. Everything below
is the implementer's measurement log.

---

## 1. WHAT WAS PORTED

`games/gradius/src/enemies.js` (appended after the W22/W23 handlers, plus two
cases wired into `dispatch`):

- **`h_B914`** (entry 24, type `$98`, slot 9) - the head per-frame handler.
  Morph stepper (`$B8EF` damage ladder, 6 HP), the loop-2 shield arm, and the
  dispatch into the alive body / death paths.
- **`h_B913`** (entry 25, type `$99`) - a no-op (`RTS`); the body slots are
  inert, every visible byte written by the head's body-sync.
- **`bossAliveBody`** (`loc_B9A8`) - the intro X-descent and the rank/fire path.
- **`bossRankAndFire`** (`loc_BA0A`-`$BA9F`) - Y catch-up, rank movement,
  body-sync, the charge/fire decision, and the volley/vulnerability/timeout
  ladder on `$04AC`/`$04CC`/`$048C`.
- **`bossRankMove`** (`loc_BA18`-`$BA68`) - rank-indexed vertical movement with
  the load-bearing CARRY tracked explicitly (LDA preserves carry; two paths into
  the fractional SBC/ADC carry different carry bits).
- **`bodySync`** + **`bodySyncSlot`** (`sub_B9B7`/`sub_B9F2`) - the body-sync,
  written once and run twice (X=9 then X=8) via the `$030B,X` slot-N-1 trick.
- **`bossFire`** (`loc_BAA0`-`$BAF6`) - the 4-bullet armament cycle.
- **`bossDeath`** / **`bossTimeoutDeath`** / **`bossDeathTail`** - both death
  triggers (damage: score + `INC $3B` + warp-gate + explosion; timeout: none),
  sharing the `$B983` explosion conversion → script 4 → metasprite `$A2`,
  body clear, and `INC $1B` (`$85`→`$86`, gated `$0100 < 2`).

`explodeInPlace` (the existing `$CB2B`) is reused for the explosion conversion;
the boss overrides `$016C` to script 4 afterward.

## 2. THE RAW-ADDRESS RESOLVER (bossGet/bossSet)

The boss mixes THREE indexing conventions inside one routine:

- `+$0C` enemy-relative (`$046C,X` → slot X+12; the HP),
- `+$0B` slot-N-1 trick (`$030B,X` → slot X+11; how both bodies get written),
- overflow / `+$0A..+$0F` (the body-sync's `$045E,X`/`$045F,X` land at
  `s0460[7]/[8]` with X=9; `$0460,X` with NO `+$0C` is the missile-damage flag
  at enemy index 9, distinct from the HP at `$046C,X`).

Every object byte for slots 7..25 is a compared field (1022-address watch
list), so byte-exactness is mandatory. `bossGet`/`bossSet` resolve a raw ROM
address (base+X) to `(array, slot)` range-for-range against `porttrace.mjs`'s
`peek`, including the `$03A0`/`$03B0` carrier/yvel split. This is the only safe
way to handle the mixed conventions; the alternative (reasoning per-convention)
mis-routes the overflow cases.

## 3. RECON CORRECTIONS (the recon was READ-ONLY; these are measurements)

- **`$032C,X` is Y, `$036C,X` is X** (the recon swapped them in §2/§8). The rank
  movement modifies `$032C,X` (Y) to track the player vertically; `$036C,X` (X)
  is the intro descent. Verified against the cartridge's head X ($F0→$A3) and
  the rank-move clamp `[$18,$A8]` on Y.
- **`$B9C8` is `LDA #$03`, not `LDA #$32`** - the `prg.asm` listing mis-printed
  it (two consecutive `A9 32` where the first is `A9 03`). Raw PRG byte at
  `$B9C9` is `$03`; the cartridge's `attrMask[19] = 3` confirms it. The oracle
  caught this on the first run (port wrote `$32 = 50`, rom had `3`). Every other
  boss immediate was then re-verified against the raw PRG - all correct.
- **The morph step scores `+$50` AND sfx `$08`** (`$B947 JSR $845B` = scoreCapsule,
  then `$B94A LDA #$08 / JSR $EC1E`). The recon §3 labelled the pair "morph-
  changed sfx" and elided the score; both are ported.

## 4. THE DONE-WHEN - MET

MEASURED end-to-end on the endchain run (re-recorded to 12000 frames so the
death is in the cartridge artifact):

- **The boss dies by TIMEOUT at f11012.** The player's RUA hold drives the ship
  to the right wall and the missiles never connect (HP stays 0 the whole fight);
  the core self-destructs at `$04CC = 6` (the `$BA9C -> $B983` path). The
  cartridge's `$1B` goes `$85 -> $86` at **f11012**, then `$90` at f11525 (the
  `$9904` stage-end, W27).
- **The port matches, frame for frame.** endchain compares **4851 of 4852
  frames green** (the +1 is the `$86` frame itself, the W27 truncation point):
  **TIER 1 800 fields, 0 divergent**, display list **0 Y / 0 live-slot
  mismatches** across the full fight + death approach.
- **The death is proven on the cartridge's frame.** The port throws at
  **`$9904 @ f11013`** -- the `$1B=$86` stage-end arm -- which it can only reach
  by `INC $1B` ($85->$86) at f11012. `compareUntilThrow: "9904"` turns that throw
  into the done-when: a non-throw (or a throw at another address) is a FAILURE.
- **The full corpus is GREEN.** `compare.mjs` over all 46 scenarios: **0
  failures, 22830 of 22831 frames** (2 truncated at their W27-ish boundaries).
  The 7 boss unit tests pin the paths no scenario exercises (the DAMAGE death,
  the morph ladder, the warp arm).

## 5. THE FALLOUT FIX: the blank pass `$8BAB` (oam.js)

Extending the window exposed a real, pre-existing renderer gap that the boss
made visible. When the core reaches the right edge (X `$F2`), its 4th armament
bullet is culled (`$8AED BCS`: `dx+$F2 > $FF`). A culled metasprite record
writes its Y/tile/attr at the OAM cursor but never stores the X byte or
advances, so the record's Y survives as a **cull-ghost** at the cursor. The
cartridge's blank pass `$8BAB` then writes `$F4` over that cursor slot's Y
(hiding the ghost). The port did NOT model `$8BAB` -- it filled `$0200-$02FF`
with `$F4` at the TOP of the pass instead, which the oam.js comment claimed was
equivalent. It was not: the cull writes Y AFTER the fill.

Result before the fix: 19 display-list Y mismatches across the late fight (all
rom `$F4` / port visible), 1 extra drawn sprite per fire frame (26 vs 25).

Fix: ported `$8BAB` (and the `$9F -> $37` budget table at `$8B97`). After the
slot loop, the walk hides `$37+1` slots from the cursor (the count from the
sprite budget `$9F = $3E - spritesStored`). `state.oamCursor` is now the WALKED
cursor (`$8BC2 STX $36`). This dropped endchain's display list to 0 mismatches
and left all 45 other scenarios green (none had cull-ghosts -- the fill had been
equivalent for them because no sprite was ever culled at the right edge).

`w_0036` (the cursor) is still the last INFO field: it is re-walked again later
in the NMI at `$80AD`, which this port does not model, so the walked cursor
sampled at `$80B5` still diverges. Left as INFO (loud, not failed); the display
list itself -- the thing the cursor drives -- is exact.

## 6. RED mutation (RULE 4)

Broke the death `INC $1B` (undid the `$85 -> $86` advance in `bossDeathTail`).
The port then never reaches `$86`, so the `$9904` throw does not fire:
`[FAIL] THREW at 9904: did NOT throw over 4851 compared frames` -- the done-when
seen RED. Restored; `git hash-object games/gradius/src/enemies.js`
(`94b63200...`) matches `HEAD:games/gradius/src/enemies.js` exactly.
