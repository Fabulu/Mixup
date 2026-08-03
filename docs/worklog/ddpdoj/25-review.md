# W25 REVIEW -- the six enemy handlers (79 % of stage-1 spawns)

status: **APPROVED WITH FINDINGS.** role: reviewer (READ-ONLY -- did not touch
`src/`, did not commit). date: 2026-08-03.
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address below is
build B (`$23xxxx`-`$2Axxxx`) unless noted.

The position-column proof for three of the six types is REAL and independently
reproduced: `$82`/`$8B`/`$10` at 0 divergent over ~38k samples, and an
independent step-omit probe confirms each per-frame step is load-bearing.
The fall-through trap (the project's #1 nemesis) is handled correctly -- all six
TRUE spans re-derived from `maincpu.bin`, including the two pre-table-address
death prologues and the shared `$269B3E` prologue. Regression is green (370 / 0
fail / 0 skip); the spawn-walker / W23 / turret / bullet gates are unchanged.

The headline, however, overstates what was verified. **The gate does not
exercise `handlers.js`** -- it calls the W24 movement interpreter directly
through a per-type driver table, never `runEnemyDriver`, never `handlers.js`
(which is imported only by its own test file). So the deliverable has only
smoke-test coverage, and two of the "ported, self-contained" helpers are
materially unfaithful to the listing. Details below.

## WHAT I RE-DERIVED AND CONFIRMED

- **TRUE spans (flow.py over `maincpu.bin`, re-derived this review):**

  | handler | entry | worklog span | REVIEW span | insns | fall-through? |
  |---|---|---|---|---|---|
  | `$11` | `$2688CC` | `$268844..$268B1E` | `$268844..$268B1A` | 177 | YES -- death prologue at `$268844` (before table addr) |
  | `$10` | `$268232` | `$2681CE..$268490` | `$2681CE..$268490` | 183 | YES -- death prologue at `$2681CE` (before table addr) |
  | `$05` | `$269CEA` | `$269B3E..$269E1C` | `$269B3E..$269E1C` | 106 | YES -- shared prologue `$269B3E` |
  | `$07/$27` | `$26A2E2` | `$269B3E..$26A4B0` | `$269B3E..$26A4B0` | 152 | YES -- shared prologue `$269B3E` |
  | `$82` | `$2747C6` | `$2747C6..$274B64` | `$2747C6..$274B64` | 222 | no |
  | `$8B` | `$27687E` | `$27687E..$276936` | `$27687E..$276936` | 47 | no |

  Every span matches (the `$11` hi differs by 4 bytes only because the worklog
  uses end-of-last-insn and the walk uses start-of-last-insn -- a convention
  difference, not a defect). **The fall-through trap is genuinely respected:**
  reading only from the table address would have lost every death path for
  `$11`/`$10` and the shared fire block for `$05`/`$07`.

- **The three-driver split (worklog F1) is correct.** flow.py call targets:
  `$11`/`$10`/`$82` call `$2638A6` (stepMovement); `$05`/`$07` call `$2417DE`
  (applyVelocity -- damage branch is FIRST, at the entry, before movement);
  `$8B` calls `$24179E` (scrollCompensate). The gate's per-type `DRIVER` table
  matches this exactly.

- **`$8B` (`$27687E`) is byte-faithful end-to-end** over its whole 47-insn
  span: the `$8130F8` stage-kill gate, scroll-comp, the X-then-Y bounds test,
  the `$16` been-on-screen free rule, the stage-1/clock>=4 bit-5 set, the
  damage branch, and the death-effect order (`$28615E` D0=1, `$28C25A`,
  `$27F8EE`, `$289004` D0=1) ending in `jmp $263762`. Spot-checked against the
  listing line-for-line; control flow matches (modulo F2 below).

- **`$11` fire-machine sprite setup (`$268990..$2689C6`) is faithful:**
  freeze gate, `($1A,A6)` speed -> `(speed&$3e)<<2` -> bit-6 / `$80390B` bit-2
  mirror -> `lea $268B9E` table -> `move.l (A0,D1),($A,A6)`. The death
  sequence (`$268844`) effect order matches the notes.

- **`$82` combined damage test confirmed:** `move.b (A6),D1; or.b $20(A6),D1;
  andi.w #$5c,D1` -- the port's `(u8(A6) | u8($20(A6))) & 0x5c` is exact.

- **`$05` damage-first + palette XOR confirmed:** entry is the damage branch;
  palette = `u8(+$2A) ^ u8(+$2B)` (`$269CFE..$269D08`); death order
  (`$28615E` D0=8, `$289004` D0=2, `$28C2A8`) then `jmp $263762`.

- **DONE-WHEN reproduced exactly.** `node tools/w25handlergate.mjs` =>
  14244 divergent of 89347 (84.0577 %), per-type: `$82` 0/204, `$8B` 0/31476,
  `$10` 0/6390, `$11` 2221/39062, `$05` 4123/4144, `$07` 7900/7895; first
  divergence `lf=2105 SPAWN handler=$26A2E2 port=($7780,$600) board=($7780,$3200)`.
  Identical to the worklog.

- **RED --break vel reproduced:** 57705 divergent (35.4147 %); `src/movement.js`
  sha256 `b08a29f166034d6...` UNCHANGED before and after (the mutation is the
  gate wrapper). Velocity corruption is detected.

- **Independent step-omit RED (this review's own probe).** I re-ran the
  "delete one handler's update" red the way the spec asks -- omit the
  per-frame step for one type but STILL compare its position samples (the
  built-in `--break skip` does not do this; see F4). Result, with the step
  removed:
  - `$82`: 204 of 206 samples diverge
  - `$8B`: 31476 of 31498 diverge
  - `$10`: 6390 of 6400 diverge
  So the per-frame step is genuinely load-bearing for every verified type --
  the 0-divergent result is not a no-op passing on empty data.

- **Deferred queue:** flow.py call targets for all six contain NONE of
  `$263678`/`$263684`/`$263690` -- confirms worklog F6 (these six handlers do
  not enqueue deferred spawns; the 43 stage-1 deferred spawns are W29).

- **Regression:** `node --test tests/` => 370 pass, 0 fail, 0 skip.
  `pgm.py check --quick`: spawn walker / enemy stats / turret / bullet gates
  PASS; the 4 FAILs are the pre-existing scroll-program gates (W24, not this
  wave).

## FINDINGS

### F1 -- MODERATE -- `fireGate267FC6` (`$267FC6`) is materially unfaithful; the "ported, self-contained" claim is false
The port (`src/handlers.js:104`) computes
`carry = i16(ram.u16(0x804000)) >= i16(d2 & 0xffff)` and a `d2` from one ROM
table, with a comment claiming the routine "draws the RNG at `$804000`".
The listing (`$267FC6..$268086`) does NONE of this:
- **No `$804000` read exists anywhere in the routine** (confirmed by scanning
  every insn in `$267FC6..$2680B6`: zero references). The RNG field is invented.
- The real carry comes from a **position-box overflow test**: `move.l ($2,A6),D1;
  sub.w D2,D1; swap D2; add.w D2,D1; bcs out` (Y half) then the same with `D3`
  (X half) -- `D2` and `D3` are stage-indexed longwords from `$242576/$24259E`
  and `$242562/$24258A`. The port loads only `D2` and ignores `D3`.
- After the box test the routine computes a **player-distance** `D4` from the
  enemy position vs up to two reference points at `$8103E8`/`$81044A` (gated by
  `$8103E6`/`$810448`), an octagonal `|dx|+|dy|/2`-style approximation. This
  `D4` is the value the fire-action consumes; the port never produces it.

Failure scenario: when W26/W27 wire real firing, an enemy the ROM gates as "do
not fire" (out of box, carry set) gets `carry=false` from the port and fires
anyway (or vice-versa), and the fire-action receives a garbage `D4`. Today the
blast radius is one mis-counted fire NOTE, so the verified position column is
untouched -- but the worklog (line 44) and commit both call this helper
"ported, self-contained", which it is not.

### F2 -- MODERATE -- systematic 68000 carry-semantics bug in all four bounds tests
Every bounds helper models an `addi.w #K; bcs/bcc` carry as
`i16(v) + K > 0xffff`. The 68000 ADD carry is unsigned carry-out,
`(u16(v) + K) > 0xffff`. These diverge for exactly `v in [$8000..$FFFF]`,
where `i16(v)` goes negative: the port under-reports carry (says "on-screen")
for high coordinate values that the ROM considers off-screen. Affected sites:
- `onScreen242684` -- Y `i16(y)+$9000`, X `i16(x)+$8000` (used by `$05/$07/$82`)
- `bounds11` -- Y `i16(y)+$ac00`, X `i16(x)+$8400` (used by `$11`)
- `handler10` inline -- Y `i16(y)+$a400`, X `i16(x)+$7c00`
- `handler8B` inline -- X `i16(x)+$8c00`, Y `i16(y)+$c000`

Worked example (`$8B` X test, `x=$C000` after the +$400): real
`$C000+$8c00 = $14C00 > $FFFF` -> carry -> free; port
`i16($C000)+$8c00 = -16384+35840 = 32768`, not `> $ffff` -> stays alive.

Failure scenario: an enemy exits the bottom/right at a coordinate `>= $8000`
(normal for this playfield); the ROM frees it, the port keeps it alive and
re-runs the handler on it -- and once fire/death are live (W26+) it fires from
off-screen. The position-column gate cannot see this: it uses the board's own
SPAWN/DEATH arc boundaries and never lets the port's bounds test decide when
to free. Fix is mechanical: drop the `i16()` (the value is already `u16`):
`u16(v) + K > 0xffff`.

### F3 -- MODERATE -- the gate does not exercise `handlers.js`; it is not wired into the driver; the worklog misdescribes the gate
`tools/w25handlergate.mjs` imports only `movement.js` and dispatches via a
hardcoded per-type `DRIVER` map (`step`/`vel`/`scroll`). It never imports
`runHandler`/`handlers.js` and never calls `runEnemyDriver`. Separately,
`handlers.js` is imported only by `tests/handlers.test.js`; `runEnemyDriver`
(`src/enemies.js:117`) is called only by `tests/objalloc.test.js` with a
stub/empty map. Nothing passes `handlerMap()` into the driver. So:
- The gate's "0 divergent" verifies the W24 movement interpreter across more
  mover types -- it does NOT verify the W25 deliverable.
- Every ported helper with real logic (`fireGate267FC6`, `onScreen242684`,
  `bounds11`, the bespoke `$10`/`$8B` bounds, the freeze gate, the cooldown
  counters) has ZERO dynamic coverage -- only the 8 smoke tests touch them, and
  those check 2-3 specific conditions, not output values.

The worklog (line 66-67) says the gate "drives the enemy driver frame-by-frame
... through the real per-frame enemy-driver dispatch" and the commit says
"wire into driver". Neither is true. The detailed FINDINGS (F2/F3/F4 in the
impl log) ARE honest about the partial; the summary/commit framing is not.

### F4 -- MINOR -- `--break skip` is a defective "delete one handler's update" red
The spec asks for a red that deletes one handler's per-frame update and watches
it diverge. The built-in `--break skip <type>` does `prev=row; continue` BEFORE
the comparison -- it DROPS that type's samples rather than running without the
step. For the verified types (`$82`/`$8B`/`$10`) the divergent count is
unchanged from baseline (still 14244) because their samples are simply gone,
so the red does not demonstrate the step is load-bearing. (This review's own
step-omit-then-compare probe -- F0 above -- DOES demonstrate it: 204/206,
31476/31498, 6390/6400 diverge. The verification is sound; the gate's red
tooling just does not show it.) The `--break vel` red IS a real, clean red
(35.4 %), and `movement.js` sha is unchanged both ways.

### F5 -- MINOR -- gate prints type values in decimal after a `$` prefix
`tools/w25handlergate.mjs:187` logs `type $${t}` where `t` is the decimal
parse of the hex type byte (e.g. `type $130` = 0x82). The `$` implies hex; a
reader could think there is a type `$130`. Cosmetic only; no logic effect.

### F6 -- MINOR -- `deathSeq11`/`deathSeq10` note `$289AF4` unconditionally
The ROM gates `$289AF4` on `btst #0,$815EA5` (called only when the cap bit is
set, `$26889E`). The JS notes it unconditionally. This over-COUNTS a note
(never silent, so not a convention violation), but the note is imprecise about
when the ROM would actually fire.

## INFORMATIONAL (honestly named, not defects)

- **The 108 residual spawn-stats fields are NOT closed** -- and that is fine.
  The W23 stats gate still reports "deferred (no script stream -- W25/W29
  handler-spawned): 108 speed/heading fields outside `$263808`'s reach". W25
  did not close them (and does not claim to); they remain honestly named.
- **`$11` position is 94.3 %** (2221 divergent on later, non-constant-velocity
  arcs) and **`$05`/`$07` are ~99-100 % divergent** (the SPAWN-Y blocker,
  impl-log F4). Honestly named as partial / blocked, not smoothed.
- **`$10`'s fire machine (`$2682F8..$268490`) is a single coarse note**, less
  ported than `$11`'s fire machine (which ports the cooldown / aim / fan
  structure). Acceptable scope choice (fire is W26/W27), but "all six ported
  structurally" is asymmetric across the six.

## MUST-FIX (concrete, for W25b or the receiving wave)

1. **F2** -- drop `i16()` in all four bounds tests (`onScreen242684`,
   `bounds11`, `handler10` inline, `handler8B` inline): `u16(v) + K > 0xffff`.
   One-line each; this is a real free-timing bug reachable with normal coords.
2. **F1** -- either translate `$267FC6` to match the listing (box test on
   `($2,A6)` with `D2`+`D3`, then the `D4` player-distance output) or demote it
   to an honest counted note until W26. Do not leave the fabricated `$804000`
   RNG carry in code that the comment calls "ported, self-contained".
3. **F3** -- reword the impl-log/commit: the gate tests the W24 movement
   interpreter per handler-type, not `handlers.js`, and `handlers.js` is not
   wired into `runEnemyDriver`. If wiring is intended this wave, add the one
   call site + a driver-driven test; otherwise mark it a W26 integration task.
4. **F4** -- make `--break skip` compare-after-omit (or document that
   `--break vel` is the only true red), so the per-handler-step red is real.

## THE VERDICT

Approve with findings. The fall-through trap (the project's repeated nemesis)
is handled correctly and the position-column proof for `$82`/`$8B`/`$10` is
genuine and reproduced. But two ported helpers are unfaithful to the ROM
(F1 fire-gate, F2 carry semantics), the deliverable has no dynamic coverage
beyond smoke tests (F3), and the impl-log/commit overstate both the wiring and
the coverage. F1/F2 should be fixed before W26 builds on these handlers; F3/F4
are about honesty of the gate's claims. Nothing here is a silent corruption of
a verified column, and the loud-named-throw / counted-note convention is
upheld throughout.
