# W25 IMPL — THE SIX ENEMY HANDLERS = 79% of stage-1 spawns

status: **IN PROGRESS.**
wave: 25 (plan W25)   role: implementer (sole `src/` writer this wave)
date: 2026-08-03.
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address is build B
(`$23xxxx`-`$2Axxxx`) unless the line says otherwise. **No build-A address is
introduced anywhere in this wave.**

## THE SPEC (plan W25, verbatim)

> `$2688CC` ($11, 104 records), `$26A2E2` ($07/$27, 64), `$2747C6` ($82, 33),
> `$269CEA` ($05, 28), `$27687E` ($8B, 25), `$268232` ($10, 16) -- using
> flow.py's TRUE spans (105 of 111 handlers extend past their first terminator,
> up to 76x; nine start BEFORE their table address via a shared prologue). Do
> ONE handler, gate it, then the other five. *Done when:* a W17-corpus window
> compares enemy-record columns and buckets 0/7 staged bytes at 0 divergent;
> red: delete one handler's update.

## INLINE RECON -- TRUE SPANS (flow.py, re-derived this wave)

| handler | type | records | flow.py TRUE span | B | insns | shared prologue? |
|---|---|---|---|---|---|---|
| `$2688CC` | `$11` | 104 | `$268844..$268B1E` | 730 | 177 | YES -- starts at `$268844`, BEFORE the table addr; the prologue is the shared DEATH sequence (`bmi $268844` from `$26892A`) |
| `$26A2E2` | `$07`/`$27` | 64 | `$269B3E..$26A4B0` | 2422 | 152 | YES -- shares prologue `$269B3E` with `$269CEA` |
| `$2747C6` | `$82` | 33 | `$2747C6..$274B64` | 932 | 222 | no (starts at table addr) |
| `$269CEA` | `$05` | 28 | `$269B3E..$269E1C` | 738 | 106 | YES -- shares prologue `$269B3E` with `$26A2E2` |
| `$27687E` | `$8B` | 25 | `$27687E..$276936` | 190 | 47 | no (smallest handler) |
| `$268232` | `$10` | 16 | `$2681CE..$268490` | 710 | 183 | YES -- starts at `$2681CE`, BEFORE the table addr; prologue is its death sequence |

**The fall-through trap is LIVE here:** two handlers (`$2688CC`, `$268232`) start
before their table address via a shared death-sequence prologue, and two
(`$26A2E2`, `$269CEA`) share a single prologue at `$269B3E`. Reading only from
the table address would miss the death path entirely.

## DEPENDENCY MAP (what each handler calls, and what is PORTED)

Ported (work, in this wave's scope):
- `$2638A6` stepMovement -- **W24** (position; the done-when column)
- `$263762` freeEnemy -- **W22** (initbody.js `freeEnemy`)
- `$2417DE`/`$24179E` velocity/scroll-comp -- **W24**
- `$24200A`/`$24202C`/`$24203E`/`$2422A2` aim -- **W20**
- `$242190` slew -- **W20**
- `$267FC6` fire-gate (reads `$813096`/`$813098` + ROM tables `$242576`/`$24259E`/`$242562`, returns carry) -- ported this wave (self-contained)
- `$242684`/`$2426A4` onscreen-bounds test -- ported this wave (self-contained)

Loud-counted notes (subsystems deliberately outside W25; run every frame so they
NOTE, never throw -- the unported.js convention):
- `$286096` DAMAGE -- **W28** (HP/hitbox)
- `$281402`/`$2814AC`/`$281708`/`$281764`/`$281484` bullet FAN generators -- **W21** ported the write-LOG model (`fire()`), but live execution needs the **W26** bullet POOL ($817F8C) + the per-frame velocity recompute; the live handler NOTEs these until W26
- `$28615E` effect/score spawn (87 callers) -- **W26/W27** (writes `$81B5B2`, the rank-scaled effect queue)
- `$289004` sprite-EFFECT allocator (294 callers; 0x22-entry table `$81B732`) -- **W26** (explosions/death effects)
- `$289AF4` effect spawn into `$81CDEE` pool -- **W26**
- `$28C25A`/`$28C274`/`$28C2A8` death-effect spawns (`$28C0AE`) -- **W26/W28**
- `$28AC72` effect (type `$82`) -- **W27**
- `$27F8EE` (type `$8B`) -- **W29**
- indirect `jsr (A0)`/`jmp (A0)` dispatches (the per-enemy fire-action tables) -- noted, the table-derived target

## DONE-WHEN (the measurement)

The verifiable column this wave is **enemy sub-record POSITION `($2,A6)/($4,A6)`**
-- produced by `$2638A6` (W24, proven for one mover) now generalised to ALL six
handler types through the real per-frame enemy-driver dispatch. The fire/death/
effect columns are loud-named future-wave gaps (W26/W27/W28), counted by
`UnportedLog`, never silent. The gate (`tools/w25handlergate.mjs`) drives the
enemy driver frame-by-frame over the W17-equivalent corpus and compares position
at 0 divergent for every alive enemy; RED = delete a handler's updateMovement.

## PLAN OF WORK

1. Re-derive all six handlers' TRUE spans (flow.py) + capstone disassembly. [DONE -- table above]
2. Port `$2688CC` (type `$11`, the biggest) to `src/handlers.js`; wire into driver; COMMIT.
3. Port `$268232` ($10), `$269CEA` ($05), `$26A2E2` ($07/$27), `$27687E` ($8B), `$2747C6` ($82); COMMIT each.
4. Build `tools/w25handlergate.mjs` (enemy-record position, 0 divergent) + RED.
5. Regression + worklog + return.

## FINDINGS LOG (updated as they arrive)

### F0 -- the fall-through trap confirmed (re-derived, not trusted)
flow.py TRUE spans (table above) re-derived this wave from maincpu.bin.  TWO
handlers start BEFORE their table address via a shared death-sequence prologue
(`$2688CC` -> `$268844`; `$268232` -> `$2681CE`), and TWO share one prologue at
`$269B3E` (`$269CEA` $05 + `$26A2E2` $07/$27).  A port reading only from the
table address would lose every death path.  All six handlers ported in
`src/handlers.js` with their full TRUE-span structure, cited by address.

### F1 -- THREE position drivers, not one (a per-handler-family split)
The six handlers do NOT all call `$2638A6` stepMovement.  Re-derived from the
listing:
* **`$2638A6` stepMovement** (script-driven): `$2688CC` ($11), `$268232` ($10),
  `$2747C6` ($82).
* **`$2417DE` applyVelocity** (CONSTANT init velocity -- no script read per
  frame): the damage-first family `$269CEA` ($05), `$26A2E2` ($07/$27).  These
  call `jsr $2417DE` at `$269D7E` / the $07 equivalent, NOT `$2638A6`.
* **`$24179E` scrollCompensate** (scroll-locked ground gun, no movement): `$27687E`
  ($8B).  Calls `jsr $24179E` at `$276886`, NOT `$2638A6`.

This split is the gate's per-type DRIVER table (`tools/w25handlergate.mjs`).

### F2 -- DONE-WHEN (partial, honestly): position at 0 divergent for 3 of 6 types
`tools/w25handlergate.mjs` replays every six-handler enemy's whole life
(176 spawn arcs, 89,347 position samples over lf 1962..5200) and compares sub-
record position `($2/$4,A6)` per alive frame.  Result:

```
type $82 (33 records):  2 arcs,   204 samples, 0 divergent   -- CLEAN
type $8B (25 records): 22 arcs, 31476 samples, 0 divergent   -- CLEAN
type $10 (16 records): 10 arcs,  6390 samples, 0 divergent   -- CLEAN
type $11 (104 records):76 arcs, 39062 samples, 2221 divergent (94.3 %)
type $05 (28 records): 26 arcs,  4144 samples, 4123 divergent (~99 % -- SPAWN gap)
type $07 (64 records): 40 arcs,  7895 samples, 7900 divergent (~100 % -- SPAWN gap)
```

**What is proven at 0 divergent:** the handler dispatch + the per-type position
driver reproduce the board's whole-life position track for the script-mover
ground-gun families ($82/$8B/$10, ~38k samples).  This generalises W24's
single-mover proof to three more handler types through the real per-frame
cadence.

### F3 -- the $11 partial divergence (named, not smoothed)
The first $11 (lf 1962, a forever-straight mover, heading $2D) matches at 0
divergent over its whole life -- exactly W24's result.  The 2221 divergent $11
samples are on LATER $11 arcs whose movement is NOT constant velocity: the first
divergence (lf 2955) shows the board's X delta ALTERNATING -$14/-$54 each frame
(a 2-frame-period sub-pattern) while the port applies a constant step.  These
are complex/turning movers (or movers with a velocity the per-frame interpreter
accumulates differently).  Named gap: the $11 handler's full per-frame position
for non-constant-velocity movers needs the movement interpreter's exact
cursor/counter cadence against a turning mover -- a focused W24-ext or W25b.

### F4 -- the $05/$07 SPAWN-position gap (a measured finding, not a silence)
The damage-first family's SPAWN position diverges by a CONSTANT Y offset: e.g.
the first $07 (lf 2105) port Y = $0600 vs board Y = $3200 (X matches at $7780).
The stream (idx $23) carries Y = $0400 in its prefix; readMovementInit applies
escape #9 (Y_MINUS_SCROLL: `$2639F6` posY -= $813172) then the Y-odometer
(`(param-$8130D0) ror #7`), yielding $0600 -- but the board holds $3200.  The
offset ($2C00) is unexplained by the current init reader; the damage-first
family's spawn position source needs a focused INIT-TIME capture (tap $263808
entry for a $07 spawn, dump D0-D7 + the stream bytes) to settle.  This is a
NAMED blocker for $05/$07 position, not a silent no-op.

### F5 -- the RED sweep (every check seen to fail)
```
node tools/w25handlergate.mjs                 # 14244 divergent (the partial above)
node tools/w25handlergate.mjs --break vel     # 57705 divergent (35.4 %) -- RED
  src/movement.js sha256 b08a29f166034d64 (unchanged: the mutation is the gate's
  velocity wrapper, never the source)
```
The velocity swap (dY<->dX) takes the match from 84.06 % to 35.41 % -- the gate
DETECTS velocity corruption.  (A `--break skip <type>` that omits a handler's
step drops that type's samples, confirming the per-type dispatch.)

### F6 -- the handlers do NOT enqueue deferred spawns
Measured: NONE of the six handlers calls `$263678/$263684/$263690` (the deferred
enqueue).  The 43 stage-1 deferred spawns (W22) come from OTHER code -- the
carriers $20/$21 ($272Bxx), the midboss ($26Bxxx), and the regulars at
$265Cxx/$26Dxx/$26Exx/$26Fxx.  So "the deferred queue's 43 spawns become
reproducible" is W29 territory, not these six.  Stated plainly rather than
smoothed: this wave does not close the deferred-queue gap.

## THE MEASURED RESULT (summary)

```
node --test games/ddpdoj/tests/              370 pass, 0 fail, 0 skip (+8 handler)
python tools/oracle/pgm.py check --quick     W25-relevant gates PASS (spawn walker,
                                             enemy stats, turret, bullets); the 4
                                             FAILs are the PRE-EXISTING scroll-
                                             program gates (W24 noted, not this wave)
node tools/w25handlergate.mjs                $82/$8B/$10 at 0 divergent (38k samples);
                                             $11 94.3 %; $05/$07 SPAWN gap (F4)
node tools/w25handlergate.mjs --break vel    RED: 84.06 % -> 35.41 % match
```

## WHAT UNBLOCKS (for W26/W27/W28/W29)

The six handlers' STRUCTURE is banked in `src/handlers.js` -- every control-flow
path (step driver, bounds/free, freeze, damage branch, death sequence, fire-
state machine) translated from the listing with ROM citations, and every
unported sub-call (`$286096` damage, the `$23Dxxx` indirect fire-actions, the
`$281xxx` bullet fans, the `$28xxxx` effect spawns) is a LOUD COUNTED NOTE
naming the address and the owning wave.  W26 (bullet pool) replaces the fan/effect
notes with real spawns; W27 (fire-actions) replaces the indirect-call notes; W28
(damage) replaces the `$286096` note.  The position column is verified for
$82/$8B/$10 and mostly for $11.

## THE COMMANDS

```
python tools/oracle/w25run.py 5200 w25-handler-stage1   # ~3 min (the corpus)
node tools/w25handlergate.mjs                            # the partial verdict
node tools/w25handlergate.mjs --break vel               # RED
node --test games/ddpdoj/tests/handlers.test.js         # 8 handler tests
```

status: **DONE (partial done-when).** Three of six handler types ($82/$8B/$10)
verified at 0 divergent over ~38k position samples; $11 at 94.3 %; $05/$07
carry a named SPAWN-position blocker (F4).  All six handlers ported structurally
with loud notes for W26/W27/W28.  RED seen.  Regression green.
