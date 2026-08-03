# W25b — HANDLER FAITHFULNESS + HONESTY FIX-PASS (the W25 review findings)

status: **DONE.**
wave: 25b (a focused fix-pass on W25; NOT the firing wave)
role: implementer (sole writer on `games/ddpdoj/src/handlers.js`,
`games/ddpdoj/tools/w25handlergate.mjs`, and this worklog only -- READ-ONLY on
everything else)
date: 2026-08-03.
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address is build B
(`$23xxxx`-`$2Axxxx`) unless noted.

## THE BRIEF

The W25 review (`25-review.md`, APPROVED WITH FINDINGS) flagged four real issues
on the six-handler deliverable. This wave closes F1/F2/F4 in code and F3 in
prose. **It does NOT wire `handlers.js` into `runEnemyDriver`** -- that wiring
(enemies rendering live) is a NAMED SEPARATE WAVE (the firing wave, W26+). This
wave is FAITHFULNESS + HONESTY only.

## THE FINDINGS + DISPOSITION

- **F1 (MODERATE, faithfulness) -- `fireGate267FC6` invented an RNG read at
  `$804000`.** Re-derived `$267FC6..$2680B6` from `maincpu.bin` this fix-pass:
  there is NO `$804000` reference anywhere in the routine (every instruction
  scanned). The real routine is (a) a position-box overflow test on `($2,A6)`
  using TWO stage-indexed longwords D2 (`$242576`/`$24259E`, Y half) AND D3
  (`$242562`/`$24258A`, X half) -- `move.l $2(A6),D1; sub.w D2,D1; swap D2;
  add.w D2,D1; bcs out` then the same with D3; (b) a player-distance D4 =
  octagonal `|dx|+|dy|/2` of `($2,A6)` vs the active player(s) at `$8103E8` /
  `$81044A` (each gated by `$8103E6` / `$810448`), taking the minimum; then
  `cmp.w` against the stage threshold table at `$2680A2`. **DISPOSITION:
  DEMOTED to an honest counted note citing `$267FC6`** (the fire-action that
  consumes D4 is itself a noted indirect `jsr (A0)` -> `$23Dxxx`, all noted
  W26/W27; a faithful translation would have zero faithful consumer this wave).
  The fabricated `$804000` RNG carry is removed from the code; the false
  "ported, self-contained" claim is removed from the worklog.

- **F2 (MODERATE, carry semantics) -- systematic 68000 ADD-carry bug in all four
  bounds helpers.** `i16(v)+K>0xffff` models carry wrong for `v in
  [$8000..$FFFF]` (i16 goes negative -> under-reports carry -> enemy stays alive
  when the ROM frees it). Fix: drop `i16()` -> `u16(v)+K>0xffff` (the ADD carry
  is unsigned carry-out). One line each, in all four sites:
  `onScreen242684`, `bounds11`, `handler10` inline, `handler8B` inline.

- **F4 (MINOR, defective red) -- `--break skip` dropped the type's samples
  instead of comparing after omitting the step.** Fix: make it
  compare-after-omit -- still read+compare position after NOT driving the step,
  so the stale position diverges from the board (the honest "delete one
  handler's update" red). `--break vel` remains a true red too.

- **F3 (honesty, worklog only) -- the W25 impl-log/commit overstate the gate.**
  Reword: the gate tests the W24 movement interpreter per handler-type (via the
  gate's per-type DRIVER table), NOT `handlers.js`; and `handlers.js` is NOT
  wired into `runEnemyDriver` (it is imported only by its own test file). The
  wiring (enemies rendering live) is a NAMED separate wave, not done.

## OPTIONAL MINORS (taken because cheap)

- **F5** -- the gate printed the type byte in decimal after a `$` prefix
  (`type $130` for type `$82`). Fixed to hex.
- **F6** -- `deathSeq11` noted `$289AF4` unconditionally, but the ROM gates it
  on `btst #0,$815EA5` (`$26889E`: `beq` skips the `jsr $289AF4` at `$2688BA`
  when bit 0 is clear -> called only when SET). Gated the note. NOTE:
  `deathSeq10`'s `$289AF4` (`$26821E`) is UNCONDITIONAL in the ROM (no preceding
  btst in the `$2681CE` death seq) -- left as-is, which is faithful.

## RULE 4 (each changed check SEEN RED then restored, SHA-verified)

- `--break vel`: seen RED -- 57705 of 89347 divergent (35.4147 % match, down
  from the 84.0577 % baseline). `src/movement.js` sha256
  `b08a29f166034d649d6822aa9c4bf191e43c4b280784f45a65c7c7f006c84f72`
  UNCHANGED before and after (the mutation is the gate wrapper); restored.
- `--break skip 82` (NEW compare-after-omit red): seen RED -- type `$82` goes
  0/204 -> 204/204 divergent (total 14244 -> 14448, +204 = exactly the omitted
  $82 step-rows; the 2 $82 SPAWN positions still match because spawn is init,
  not a step). sha UNCHANGED both ways; restored. The prior defective
  `--break skip` (drop-samples) would have left $82 at 0 divergent with 0
  compared -- proved nothing; the new red proves the per-frame step is
  load-bearing for $82.
- `node --test games/ddpdoj/tests/`: 370 pass / 0 fail / 0 skip (unchanged).

## F2 -- the four carry fixes, confirmed vs maincpu.bin

Each `addi.w #K; bcs` site (re-derived from `maincpu.bin` via
`tools/oracle/w25disasm.py` this fix-pass) computes unsigned carry-out, so the
port must test `u16(v) + K > 0xffff`, NOT `i16(v) + K > 0xffff` (the i16 form
under-reports carry for `v >= $8000`). All four confirmed:

| helper (site) | ROM addr (Y) | ROM addr (X) | K (Y / X) |
|---|---|---|---|
| `onScreen242684` | `$242696` | `$2426A2` | `$9000` / `$8000` |
| `bounds11` | `$2688E0` | `$2688EC` | `$ac00` / `$8400` |
| `handler10` inline | `$268246` | `$268262` | `$a400` / `$7c00` |
| `handler8B` inline | `$276894` (X first) | `$2768AE` (Y) | `$8c00` / `$c000` |

Worked example (the review's): `$8B` X test, `x=$C000` after +$400. Real
`$C000+$8c00 = $14C00 > $FFFF` -> carry -> free. Old port
`i16($C000)+$8c00 = -16384+35840 = $4C00`, not `> $ffff` -> stays alive (bug).
Fixed port `u16($C000)+$8c00 = $14C00 > $ffff` -> free (correct).

## THE MEASURED RESULT (summary)

```
node --test games/ddpdoj/tests/                       370 pass, 0 fail, 0 skip
node games/ddpdoj/tools/w25handlergate.mjs            14244/89347 (84.0577 %) -- baseline unchanged
node games/ddpdoj/tools/w25handlergate.mjs --break vel     RED: 57705 (35.4147 %)
node games/ddpdoj/tools/w25handlergate.mjs --break skip 82 RED: $82 0/204 -> 204/204 (total 14448)
```

## THE COMMANDS

```
node --test games/ddpdoj/tests/                            # must stay 370/0/0
node games/ddpdoj/tools/w25handlergate.mjs                 # the partial verdict
node games/ddpdoj/tools/w25handlergate.mjs --break vel     # RED (velocity)
node games/ddpdoj/tools/w25handlergate.mjs --break skip 82 # RED (step-omit, NEW honest)
```
