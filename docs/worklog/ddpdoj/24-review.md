# W24 REVIEW — the movement interpreter: $2638A6, the 13 opcodes, the velocity cache

status: **APPROVE WITH MINOR FINDINGS.** role: reviewer (READ-ONLY — no `src/`
edits, no commit). target: `ddpdojblk` VERSION-B (`$23xxxx`-`$2Axxxx`). Every
static check re-derived from `tools/oracle/out/maincpu.bin` via capstone 5.0.7;
every dynamic check run against the existing W17-equivalent / W24 corpora on disk.
date: 2026-08-03

## THE VERDICT

The interpreter is **byte-faithful to the listing** and **all three done-whens are
independently reproduced**. The 13 opcodes (HEAD / `>=$C0` SPEED / 12 escapes
incl. the loop-back) re-derive from `maincpu.bin` opcode-for-opcode against
`src/movement.js`; the velocity D2->+$02 / D3->+$04 wiring and the four quadrant
arms match `$2417DE`/`$241812`; the init reader `$263808` (incl. the long-copy +
scroll + ror#7 odometer) and the EXIT target `$263762` match. The mover-position
gate is **0 divergent over a 365-frame whole life** and the **RED goes red
(365/366)** with `src/movement.js` SHA-identical both ways. The W23 spawn-stats
gate re-closed: **0 divergent / 308 (was 2)**, the 511 deferred movement fields
are strict at 0 on the 270 scripted spawns, the 2 `$88` hb14/hb16 residuals
collapsed (anim is now computed), and the 3-mutation RED sweep is red. Regression
green (362 pass / 0 skip); the spawn walker is unchanged.

Two minor findings below — neither is a correctness defect in the ported code.
The work is strong.

## WHAT I INDEPENDENTLY VERIFIED (re-derived, not trusted)

| check | method | result |
|---|---|---|
| resource #$1F bounds + aux table | re-read stage entry0/1 at `$263336`; aux at `$23170C` (163 words, `$23170C+163*2==$231852`); res `$231852..$2325D0` | **3454 B, 163 streams, aux monotonic non-decreasing** (matches recon §1 verbatim) |
| stream sizes | aux[i+1]-aux[i]; last = res_size-aux[162] | **sum 3454 == res_size; min 6 / max 56 / mean 21.19** (recon: 21.2) |
| stream usage | walked the 339 spawn records at `$230C6C` | **160/163 used; unused `$000`/`$042`/`$05E`; max idx `$0A2`; 0 out-of-range** |
| opcode census | my own prefix-correct walker over all 163 streams | **HEAD 845 / SPEED 469 / ESC 89** (matches recon exactly) |
| sample stream decodes | idx `$001`/`$023`/`$040`/`$071`/`$072` | `$001`=SPEED 03/HEAD 2D p=00; `$023`=ESC9/HEAD 20 p=00; `$040`=HEAD 40 p=00; `$071`/`$072` end on EXIT (all match recon §6) |
| termination census | frame-by-frame sim (counter counts out; cycle-detected) | **161/163 PARAM-$00 forever, 2/163 EXIT (`$071`/`$072`), 0 loop-back, 0 run-off-end** (matches recon §3) |
| `$263808` init reader | capstone disasm vs `readMovementInit` | **byte-faithful.** Long-copy `move.l ($48,A5),($2,A6)` -> X=hi,Y=lo,Y+=scroll (F0#1 fixed); `cmpi.b #$80,($4,A6)` reads the HIGH byte (F0#5 comment correct); `ror.w #7` odometer; `bset #5` dirty; op hoisted out of the peek loop (F0#6 fixed). |
| `$2638A6` per-frame | capstone disasm vs `stepMovement` | **byte-faithful.** HEAD param/counter state machine (param==0 hold / counter==param advance+dirty / else counter++); stop heading (`h>=$40` => no apply); dirty->recompute+cache / clean->reuse; freeze return. |
| 12 escapes + dispatch `$263948` | capstone disasm of `$263978..$263A0C` + the 12 longword table | **all 12 byte-faithful.** #0 loop-back `(a0-2*off)>>>0` (F0#3 32-bit fixed); #2/#3 `(n-1)===0` branches; #5/#6 packed `((w1&$FF0)<<4)+((w2&$FF0)>>4)`; #9 `+$04-=$813172`+skip; #10 EXIT -> `$263762` frees sub-records + clears type word. Dispatch table reads `$263978/$982/$988/$99A/$9AC/$9B2/$9CE/$9EA/$9F0/$9F6/$A04/$A0C`. |
| `$2417DE`/`$241812` velocity | capstone disasm vs `applyVelocity` + `vectors.js` | **byte-faithful.** D2 (table longword[0] `asr #4`) -> posX(+$02); D3 (longword[1]) -> posY(+$04). `vectors.js` returns `{dy:D2,dx:D3}`; the 4 quadrant arms `$241850/$870/$890/$8B0` (rts / neg d2 / neg d2+d3 / neg d3) reproduce (lines 110-112). Cache `+$40`=D2/`+$42`=D3 consistent dirty vs clean. |
| `$24179E` scroll comp | capstone vs `scrollCompensate` | **byte-faithful.** `move.l $80b03c/swap/add.w` adds the ORIGINAL HIGH word; `ram.u16($80b03c)` (F0#4 fixed — draft read `$80b03e`). |
| build-B purity | every 6-hex address in `movement.js` | **only `$200920` (the velocity DATA field, same across builds, recon §4); all code addrs `$23xxxx`-`$26xxxx`. No build-A code address.** |
| DONE-WHEN #1 (unit tests) | `node --test tests/movement.test.js` | **19 pass / 0 skip.** Covers init reader, the HEAD state machine (p=00 hold / p=N counter-done advance / stop heading), all 12 escapes (both arms of #2/#3, #0 32-bit, #4-#9, #11 NOP), EXIT per-frame + in-init, `$2417DE`+freeze, `$24179E` high-word, and the 163-stream replay (161 hold + 2 EXIT, no run-off-end). |
| DONE-WHEN #2 (mover position) | `node tools/w24movegate.mjs` | **0 divergent / 366 (100.00 %), $11 idx `$001`, lf 1962..2327.** RED `--break vel` = **365/366 divergent (seen red)**. `src/movement.js` sha256 `b08a29f166034d64` UNCHANGED both ways (mutation is the gate's velocity wrapper); independently re-hashed off disk. |
| DONE-WHEN #3 (W23 gate) | `node tools/w23statsgate.mjs` | **0 divergent / 308 (100.0000 %), was 2.** 270 scripted spawns strict (511 -> 0); 108 deferred (non-script, W25/W29, named); 66 aim->bucket; `$88` hb14/hb16 CLOSED. RED sweep: swap-tables=820 / corrupt-hp=111 / seed-wrong-stage=14 (all RED). |
| test suite | `node --test tests/` | **362 pass / 0 fail / 0 skip.** |
| spawn walker (no regression) | `node tools/w22spawngate.mjs` | **0 divergent / 10742 lf, 339=339, cursor `$231704` both sides.** |
| `pgm.py check --quick` | ran it | spawn-walker [PASS]; **enemy-stats [PASS]** (was [FAIL] in W23-review F2 — the 2 `$88` residuals closed); enemy-stats RED [PASS]; assets/integrity [PASS x5]. scroll-program [FAIL x4] are PRE-EXISTING (W22 §8.5; named in W23-review line 34), NOT a W24 regression. |
| F1/F2 wiring | `resolveMovementPtr` = `res+aux[idx]` (recon §2 chain); `readInitPosition`->`readMovementInit` at all init-body `$263808` jsr sites; `installStage` `prot.setSlot($1F,res)` | **wired.** `player.tables.json` carries **83 windows** incl. the `$231852`/3454 B resource #1F window. |
| F4 precedence fix | `initbody.js:552` | **fixed:** `a6 + (an !== 0 ? S.hit14 : S.hit16)` — parens make `a6+` apply to the whole ternary (was `(a6+an)!==0 ? 0x14 : 0x16`, writing to addr `$14`). |
| commit hygiene | `git log`/`show --stat` | 3 incremental W24 commits (`0d81f26`/`021701a`/`415292b`) + the `53eff89` SALVAGE; only movement-related files touched (movement/initbody/spawn.js, the 2 tests, export-tables.py, w23statsgate.mjs). |

### On the 511-field close (the W23 gate, before/after)

Before (W23 worklog + W23-review F1, both measured): **2 strict divergences**
(`$88` hb14/hb16) + **511 speed/heading/anim/flags fields blanket-deferred** as
`$263808` (resource #$1F) overrides + 73 aim->bucket (position) + the
rank-counter/stale-bucket buckets. After (this review, re-run): **0 strict
divergences / 308**, the movement fields on the **270 scripted spawns are STRICT
at 0 divergent** (the init reader now runs and overrides per-spawn), and the
**remaining 108 are honestly classified `deferred`** (no script stream — they are
handler-enqueued via `$815EAA`, W25/W29, never `$263808`'s output). The gate now
treats the residual as a named gap, never a silence — exactly the re-close the
spec asked for. The `$88` hitbox branch that W23-review F1 predicted would "bite a
downstream wave trusting a spawned enemy's fields" did bite (impl F4), and was
fixed.

## THE FINDINGS

### F1 — MINOR: worklog mis-records WHICH `pgm.py check` gates fail

The impl worklog's REGRESSION section annotates the command:
```
python tools/oracle/pgm.py check --quick    asset-integrity FAILs are PRE-EXISTING
                                            (TX/BG tile + ROM-set; not W24 gates)
```
This is **factually wrong on the gate name**. I ran `pgm.py check --quick`; the
actual result is **assets/integrity [PASS] (all 5 incl. RED)** and the
**pre-existing FAILs are `scroll program` (4 gates: the 10,431-frame whole-stage,
its 9-mutation RED, the attract entry clock `$0038`, and its no-fast-forward
RED)** — i.e. the W22 scroll-program gates (W22 §8.5 / W23-review line 34), not
asset-integrity. The W24-owned gates (spawn walker, enemy stats + RED) all PASS.

**Failure scenario:** a teammate or CI run reads "asset-integrity FAILs are
pre-existing" and (a) ignores an asset-integrity regression that lands later
(trusting the worklog that it was already red), or (b) wastes time hunting a
TX/BG-tile failure that does not exist. The project's "A SKIP IS NOT A PASS"
discipline makes an inaccurate regression annotation mildly load-bearing.

**Fix (implementer's call):** correct the line to "scroll-program [FAIL x4] are
PRE-EXISTING (W22 §8.5); assets/integrity, spawn walker, enemy-stats + RED all
PASS." No code change.

### F2 — INFORMATIONAL: the dynamic mover verdict covers the steady-state path; branch coverage rests on unit tests

The mover-position gate (DONE-WHEN #2) validates **one** type-`$11` mover, idx
`$001`, whose stream is `SPEED 03 | HEAD h=2D p=00` — a constant-velocity
forever-mover. Over its 365-frame life, speed/heading/cursor never change, so the
dynamic board comparison exercises: the init position prefix + the Y-odometer
`ror#7` adjust + the `-$800`; per-frame `$24179E` scroll compensation (class byte
bit 0 set); the dirty->recompute+cache transition (frame 1) and the clean reuse
(frames 2-365); and constant-velocity application. It does **not** dynamically
exercise: the counter-done advance (a HEAD with `p!=0` counting out), any escape
opcode, the EXIT abort, the stop heading (`h>=$40`), or a velocity recompute on a
**changed** heading. Those branches are covered by the **19 unit tests** (synthetic
streams, every escape + both `n` arms + the counter-done advance + EXIT + stop +
loop-back) and the **163-stream replay** (which itself checks only for
run-off-end/EXIT, not board position).

This **meets the letter of the plan** (the done-when is "ONE scripted mover's
position track") and is **honestly disclosed** in impl F5/F6. I note it because
RULE 5 (coverage is branches, not frames): the whole-life dynamic verdict — the
strongest evidence — is concentrated on the single simplest path, and a future
wave that wants a dynamic verdict on, say, the counter-done advance or a
scroll-locked `$8A`/`$8B` ground gun (which use `scrollCompensate` with a
non-trivial `$80B03C`) would need a second mover corpus. Not a defect; a
coverage observation for W25/W29 to build on.

**No action required** (the unit tests + static replay already cover the
untested-dynamically branches; the implementer named this themselves).

## POSITIVES (the work is strong)

- The **salvage discipline worked exactly as warned.** The draft `movement.js`
  was "plausible and partly wrong" — five defects survived because nobody had
  verified it (F0#1-#5 by listing-diff, F0#6 by the unit tests). The implementer
  re-disassembled `$263760..$263A0C` + `$241790..` + `$241812` from `maincpu.bin`
  and corrected all six before wiring. I re-derived each routine independently and
  confirm every fix (the long-copy bit-6 branch, the EXIT `MOVE_EXIT` sentinel, the
  loop-back `>>>0`, the `$80b03c` high-word, the op-out-of-scope hoist).
- The **velocity D2/D3 mapping** (the easy thing to get backwards) is correct and
  consistent between the dirty and clean paths, and is empirically confirmed by
  the 0-divergent mover gate over 365 frames. The `vectors.js` reuse (W20/W22) is
  sound — W24 adds no new velocity data, only the `($40,A5)` cache + the bit-5
  dirty discipline.
- The **loop-back / run-off-end question** (the plan's specific ask) is closed
  statically AND dynamically: my frame-by-frame sim reproduces 161/163 PARAM-`$00`
  forever + 2/163 EXIT + 0 loop-back + 0 run-off-end, and the 163-stream replay
  test asserts the same.
- The **W23 gate re-close is honest**, not cosmetic: scripted spawns' movement
  fields became STRICT (closing the 511), the residual non-script spawns are a
  NAMED `deferred` gap, and the `$88` hitbox precedence bug the gate exposed (F4)
  was fixed rather than papered over.
- **No quiet returns** in the unported paths; every stage-1-unused escape (0, 3,
  4, 5, 6, 7, 11) is ported from the listing and exercised by a unit test, so a
  later stage that emits one is not a silent fall-through.
- The **RED discipline is clean**: the mover mutation is a gate wrapper (the source
  SHA is byte-identical both ways, independently re-hashed), and the W23 3-mutation
  sweep is byte-faithful table/HP/stage swaps at the data the loaders read.

## REPRODUCTION

```
# static (re-derive from maincpu.bin)
python games/ddpdoj/tools/oracle/w24streams.py     # 163 streams / 3454 B / census
# dynamic (corpus on disk)
node games/ddpdoj/tools/w24movegate.mjs            # 0 divergent / 366
node games/ddpdoj/tools/w24movegate.mjs --break vel# RED 365/366; sha unchanged
node games/ddpdoj/tools/w23statsgate.mjs           # 0 divergent / 308
node games/ddpdoj/tools/w23statsgate.mjs --break all  # 3 RED
node games/ddpdoj/tools/w22spawngate.mjs           # 0 divergent (no regression)
node --test games/ddpdoj/tests/                    # 362 pass / 0 skip
python games/ddpdoj/tools/oracle/pgm.py check --quick  # W24 gates PASS; scroll-program pre-existing FAIL
```
