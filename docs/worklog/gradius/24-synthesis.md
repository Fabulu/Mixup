# Wave 24 SYNTHESIS — the play sub-state machine (jt_$982F) and game-over arm

status: DONE (synthesis; DOCS-only role — verdict + commit, no src/ or test edits)
synthesizer, 2026-08-02

Read in full: `24-impl-substate-machine.md`, `24-review.md`,
`24-qa-adversarial.md`, `24-test-hardening.md` (all four W24 worklogs), plus
the round context (`20-plan-completeness.md` §1 ledger + §3 W24 brief,
`22-impl-six-routines.md`, `22-review.md`, `HANDOVER.md` §7).

---

## VERDICT: NEEDS-FIX

The code is SOUND and the gate is GREEN with zero skips, but **six open
MODERATE-or-higher findings** stand between W24 and SHIP — all of them test-
quality or tooling, none a correctness defect, and every one ships with its
exact diff already written. The SHIP bar ("gate green with zero skips, no open
CRITICAL/MODERATE review findings") is not met while these are open.

The single load-bearing one: **the `$9658` per-frame `$5B` clear — the
foundation of the `$997E` dead-branch absence proof — is not guarded by any
test that can see it fail** (test-hardening Finding C, their "HIGH"). That is
the project's own RULE 4 in its exact shape: a check that cannot fail is a
decoration. It is cheap to fix (pre-set `zp5B = 0xFF`, assert `=== 1`; exact
code in `24-test-hardening.md`). Until it lands, the wave's central safety
property rests on the *listing* (the comment at `nmi.js:594-598` plus the
absence of fall-through code), not on any executable check.

No CRITICAL correctness finding exists. All three independent roles concluded
SOUND: the reviewer ("No correctness defect found"), QA ("No defect in the W24
port"), and test-hardening (every sound check credited; the file's defects are
four checks that don't live up to the header). Every ported line was re-derived
from `rip/prg.asm` instruction-by-instruction by two roles independently
(review from the listing, QA from the raw ROM bytes) and both match. **This is
a test-hardening fix-up, not a re-implementation** — the next pass is short.

---

## The gate, consolidated (all three roles re-ran it; they agree)

```
node --test games/gradius/tests/      445 pass, 0 fail, 0 skipped   (was 416)
node games/gradius/tools/test-all.mjs GREEN, 10 passed, 0 failed, 0 SKIPPED
                                         44 scenarios, 17416/17416 frames
                                         (regression clean; self-check neuts all RED)
python games/gradius/tools/census.py dispatch
    entries ported 19 / 42 ; throwing 23 ; distinct 16 / 34   (UNCHANGED —
    W24 ports the jt_$982F state machine, not the $AE1C enemy dispatch)
```

Zero skips on both gates. A SKIP IS NOT A PASS — read past it; there are none.

---

## The honest coverage sentence (RULE 5 — branches and table entries, not frames)

> Of the **6 ported play sub-states** (`$80`-`$85`), **6 of 6** transitions are
> executed and matched IN ISOLATION (`$80`'s `$9A56` exit, `$81`, `$82`, `$83`,
> `$84`'s BEQ-hold and advance paths, `$85`). Of the **10 unported play arms**
> (`$86`-`$8F`), **10 of 10** throw with their ROM address. The jt_$982F
> dispatch table is **7 of 16** ported (was 1); the `$96A5` `$1B` ladder is
> **3 of 5** ported (was 2). Of the `$96FB` game-over arm, **2 of 2** ported
> sub-paths (the `$B0`-gated jingle hold, the `$4C` continue-timeout
> countdown) are executed AND field-verified against the cartridge (**402
> frames, 0 field-divergences**, QA's `cmp-gameover.mjs`), and **5 of 5**
> unported sub-paths (`$970D`/`$9751`/`$9721`/`$97C5`/`$97F1`-demo) throw.
>
> UNEXERCISED: the in-situ SEQUENCE — the chained `$80 -> $85` timeline and the
> 1,022-field cartridge comparison through the 768-frame `$82` countdown and
> the 512-frame `$84` despawn crawl — because no `scen/endchain.json` field
> dump and no `endchain` compare scenario exist (only `deep-ground`/`deep-
> page3`/`deep-page4`/`deep-powered`; the boss page `$0C00` is unreachable from
> any button script — every attempt dies from terrain `$C2C1`, which the shield
> poke does not prevent). The `$1B` timeline itself is HOOK-confirmed
> (`throwaudit-endchain.json`: `$82` 768 fr, `$84` 512 fr, `$85` 1101 fr,
> `$81`/`$83` 1 fr each — the durations the port reproduces), NOT field-
> compared. The `$82`/`$84` durations are unit-confirmed only in miniature (2
> frames / 1 frame), not at scale. **4 of 28** `w24-substate.test.js` checks
> are decorative or under-aimed and stay GREEN on the regression they name
> (lines 47, 245, 337, 348 — test-hardening A/B/D/C); the `$9658` clear
> underpinning the `$997E` dead-branch absence proof is unguarded by any test
> that can see it fail.

---

## Consolidated findings (severity, owner, status)

CRITICAL correctness: **none.** Three independent roles agree the ported lines
are byte-faithful to the ROM. Every MODERATE-or-higher item below is test-
quality or tooling; exact fixes are written in the cited worklog.

| # | sev | finding | owner | fix |
|---|---|---|---|---|
| C | **MODERATE+** (test-hardening "HIGH") | `$9658` `$5B` clear (nmi.js:293) — foundation of the `$997E` dead-branch absence proof — is unguarded; deleting it stays GREEN (line 348 test pre-sets `zp5B=0`, masking it) | implementer (test) | `24-test-hardening.md` Finding C: pre-set `zp5B=0xFF`, assert `===1` |
| R-F1 | **MODERATE** | `$82` countdown zero-test half unpinned: `(zp4C\|zp4D)!==0` -> `(zp4C)!==0` is GREEN; mutant ends the timer 512 fr early (256 not 768). Ported line IS correct (`$99F2 LDA $4C / ORA $4D`) | implementer (test) | `24-review.md` F1: add `$4C:$4D=$01:$01` test, assert substate stays `$82` |
| T-A | **MODERATE** | line-47 test "jt_$982F is 16-entry" is a TAUTOLOGY (`(0x80\|n)&0x0F===n`); never calls `nmi()`. Guards nothing in `playArm` | implementer (test) | `24-test-hardening.md` Finding A: delete, or assert `$88` does not run `$80`'s body |
| T-B | **MODERATE** | line-245 boss-handler regex `/undefined\|handler\|\$\|Error/` matches ANY ROM-addressed throw; would pass for a wrong throw | implementer (test) | `24-test-hardening.md` Finding B: tighten to `/B914/` |
| T-D | **MODERATE** | line-337 test samples 5 frames — too short for the 256-frame `$5B`-wrap hazard its own RED WHEN names; also green if `$9658` removed | implementer (test) | `24-test-hardening.md` Finding D: rewrite RED WHEN; add `$5B=0xFE` boundary loop |
| Q-2 | **MODERATE** (tooling) | `compare.mjs`'s `MODELLED_1B` = `{0,1,2,3,4,$80,$A0}` excludes `$81-$85`,`$C0`; harness truncates, so even with a recorded `scen/` the standard gate CANNOT field-compare the W24 sub-states (QA had to write `cmp-gameover.mjs`) | compare.mjs owner (W28 tooling) | `24-qa-adversarial.md` finding 2: add `$81-$85,$C0` to `MODELLED_1B` |

Deferred / minor / informational (do NOT block SHIP once the six above clear):

- **Q-3 / T-E (INFORMATIONAL):** no `scen/endchain.json`, no boss-page-reaching
  script. This is the only path to in-situ `$80->$85` chain coverage; needs a
  RUA-hold script that survives to scroll `$0C00` (not found) or a both-sides
  `$0100:=1` invuln poke (labelled; valid for transition coverage, not spawn
  timing). Owner: W28 / a follow-up wave. Plan done-when #7.
- **R-F2 (MINOR/INFORMATIONAL):** `$83` stage boundary `CMP #$05` pinned only
  from above; stage 4 (normal) untested because the port loads one stage
  (`$19`=0). Faithful transcription; recording only.
- **R-F3 (MINOR, dup of T-B):** review also flagged the line-245 loose regex
  (F3). Same fix as T-B.
- **R-F4 (INFORMATIONAL):** `$81-$85` + `$C0` are unit-tested only (modulo
  QA's `$96FB` closure); no in-situ field comparison. Already disclosed; same
  root cause as Q-3.
- **T-F (MINOR):** line-62 test titled "8 unported play arms" iterates 10
  (`$86`-`$8F`). Rename.
- **T-G (MINOR):** `deepEqual(RANK_CD, [...])` pin duplicated (lines 133, 450).
  Consolidate into the export test.
- **T-H (MINOR):** line-361 `$96FB` INC test pre-sets `zp5B=0`, same mask as C
  but lower stakes (`gameOverArm` does not hinge on `$9658`). Pre-set `0xFF` if
  desired.

---

## Done-when scorecard (W24 brief, `20-plan-completeness.md` §3)

| done-when | status | evidence |
|---|---|---|
| `$1B` timeline reproduced to the frame ($81, $82=768=$9A35[rank]×256, $83, $84=512 @0.5px/fr, $85 entry) | **PARTIAL** — HOOK-confirmed, NOT field-compared | `throwaudit-endchain.json`: `$82` 768, `$84` 512, `$85` 1101, `$81`/`$83` 1 each. No `scen/endchain.json` per-frame field dump (Q-3). |
| `$82` = `$9A35[rank]`×256 at rank != 1 | **port-MEASURED**, cartridge rank-4 unmeasured | QA: rank 0→768, rank 1→768, rank 2→1024, rank 4→**1280** (closes the plan's "table-derived, unmeasured" gap on the port). No powered cartridge run reaches the boss page. |
| game over field-exact | **CLOSED** | QA `cmp-gameover.mjs`: 402 frames, **0 field-divergences** (`$1B/$4C/$5B/$0A/$0100`). The `$B0` jingle hold (276 fr) + `$4C` countdown (120 fr) reproduce frame-for-frame. |

So: game-over field-exactness is CLOSED (a genuine positive — the highest-
traffic unported arm, 794 executions in ordinary play, is now field-exact); the
`$1B`-timeline *field* comparison is the remaining gap and it is structural
(no boss-page-reaching script), stated per RULE 2.

---

## What each role concluded (one line each)

- **impl** (`24-impl`): DONE. 6 play arms + game-over arm + `$97F1` entry
  ported; jt_$982F 1→7/16, ladder 2→3/5; 17/18 mutations RED; the in-situ
  `$1B`-timeline field dump explicitly deferred per RULE 2.
- **review** (`24-review`): SOUND. Every routine re-derived from the listing;
  13/16 mutations RED; two GREEN survivors the impl table did not name are the
  findings (F1 load-bearing: `$82` zero-test unpinned; F2/F3/F4 minor/info).
- **qa** (`24-qa-adversarial`): SOUND. Hand-decoded every W24 routine from raw
  ROM bytes — no defect; 19/19 adversarial port checks; rank-4 `$82` (1280 fr)
  port-measured; **done-when #3 (game-over field-exact) CLOSED** (402 fr, 0
  div); two tooling gaps named (MODELLED_1B; missing scen/endchain).
- **test-hardening** (`24-test-hardening`): DONE (READ-ONLY, recommendations
  only — did NOT edit tests). 4 of 28 checks are decorative/under-aimed (A/B/
  C/D); C is the HIGH one (the `$9658` clear is unguarded). Exact replacement
  code filed for every finding.

---

## What I ruled out (so nobody re-derives it)

- **No correctness defect in src/.** Three roles, two independent re-derivations
  (review from listing, QA from raw bytes), mutation testing by impl (17/18)
  and review (13/16) — all converge on SOUND. The `& 0x0F` dispatch masking is
  proven safe by the ladder ordering (bit-4 `$96CF` throw runs BEFORE playArm).
  The `$997E` fall-through IS dead (`$9658` zeroes `$5B` every mode-5 frame;
  implementing it respawns the boss every 256 fr — review mutation #11 went RED).
- **The one documented survivor (`$994A` `$14`→`$15` object-clear bound)** is
  faithfully transcribed and silently unobservable: slot `12+$14=32` is past
  the end of the port's separate 32-slot arrays (the cartridge's alias does not
  exist here). Same shape as W22's `$AFD2`. It stands on the listing, not a test.
- **`$96FB` is not a coverage hole for behavior** — QA field-compared it (402
  fr, 0 div). The hole is that the STANDARD harness (`compare.mjs`) cannot do
  that comparison (Q-2), so it took a one-off harness.
- **The verdict is NEEDS-FIX on test discipline, not on the port.** Shipping
  the port as-is would not change a single compared frame; it would ship four
  checks that agree with the code by construction and leave the `$9658`
  foundation unguarded — exactly the RULE 4 defect the project has been burned
  by before. The fixes are small, test-only, and exact code is already written.

status: DONE
