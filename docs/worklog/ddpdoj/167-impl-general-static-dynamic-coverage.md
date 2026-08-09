# W167: General static and dynamic coverage

Status: DONE

## Scope

Generalize the existing ROM-backed boss walker and static/dynamic join for other evidence-supported closed DOJ dispatcher and script families. Integrate the result into the existing check and publish path without weakening boss coverage.

## Premise check

W102 had already implemented and integrated the boss-only walker in `bosscoverage.py` and `pgm.py`. W105 had also established that the boss stride-8 scheduler cannot be treated as a universal table shape. This wave therefore did not rebuild the boss gate or repeat the stale W100 plan. It retained W102 as the authoritative boss gate and reused only its proven ROM reader and routine walker.

## Architecture

`dojcoverage.py` is a reusable coverage core with adapters for closed ROM shapes. Every static inventory comes from the VERSION-B ROM. Every ported set is parsed from a live source registry or source call set, never copied into the tool as a hand-maintained list. Existing board and port artifacts supply independent dynamic evidence where such evidence exists.

The join has two deliberately different meanings:

- Static minus dynamic names inventoried code that the available corpus did not exercise. It is reported, not guessed away.
- Dynamic minus static is a hard inventory failure.

Only the W102 boss inventory retains its already-proven `DEAD` classifications. This wave adds no `DEAD` labels. Null enemy-table entries are reported separately as `null`, and computed or unresolved targets remain `UNKNOWN`.

The committed baseline contains tokens derived from the live source registries. It does not contain hand-authored record lists. A source registry entry outside its ROM inventory is also a hard inventory failure.

## Closed families

| Family | ROM shape | Ported coverage | Dynamic join |
|---|---|---:|---:|
| Top-level objects | 20-entry pointer/data table at `$240F62` | 7/20 | 8 observed |
| Type-5 direct calls | 23 direct `jsr.l` sites in `$28B5E6..$28B66A` | 17/23 | UNKNOWN |
| Enemy types | two 128-entry init/handler tables at `$267824` and `$27E412` | 29/256, plus 130 null | 31 observed |
| Stage-1 spawn script | `$FFFF`-terminated stride-8 records from stage table `$263336[0]` | 339/339 | UNKNOWN |
| Stage-2 spawn script | `$FFFF`-terminated stride-8 records from stage table `$263336[1]` | 231/332 | UNKNOWN |
| Stage-1 BGELEM | adjacent closed constructor table from `$262302[0]` to `[1]` | 13/13 | 13 observed |
| Stage-2 BGELEM | adjacent closed constructor table from `$262302[1]` to `[2]` | 0/8 | 6 observed |

The current dynamic-minus-static result is zero. The useful static-minus-dynamic results include 12 top-level object entries, 95 live enemy-type entries, zero stage-1 BGELEM entries, and two stage-2 BGELEM entries. Families without independent dynamic evidence say `UNKNOWN` instead of manufacturing an execution claim.

The exact backlog is machine-readable in `dojcoverage-config.json`: stage 3 through stage 5 spawn scripts, stage 3 through stage 5 BGELEM tables, the 18 register-computed non-bee pool-A kinds, closure-only HUD/result/hyper roots without a stable source registry, and address-register indirect call targets.

## Honest lower bounds

The shared W102 routine walker provides lower-bound code sizing for resolved direct targets:

| Family | Instructions | Bytes | Unresolved indirect calls |
|---|---:|---:|---:|
| Top-level objects | 2,474 | 10,896 | 14 |
| Type-5 targets | 1,232 | 4,610 | 11 |
| Live enemy routines | 17,195 | 73,526 | 42 |
| Stage-1 BGELEM | 225 | 1,006 | 0 |
| Stage-2 BGELEM | 144 | 662 | 0 |

Address-register `jsr` and `jmp` targets are counted but not guessed. The report labels all instruction and byte totals as lower bounds.

## Gates and deliberate reds

Three W167 stages now run immediately after the unchanged W102 boss coverage stages in the DOJ `pgm.py check` path:

1. Current reusable coverage and inventory.
2. A deliberate coverage regression that removes one live registry token and must fail.
3. A deliberate inventory regression that injects a dynamic object outside the static table and must fail.

Both deliberate reds were observed failing, and the restored current gate is green. The focused W167 test is 3/3 with zero skips. The pre-existing boss gate remains green at 103/111 ported, zero live-unported, eight ROM-proven dead, and zero dynamic-minus-static.

## Verification

- Full unit suite: 1,429/1,429 passed, zero failed, zero skipped.
- `npm run typecheck`: passed.
- `node tools/publish.mjs --only ddpdoj --dry`: passed unit, typecheck, bundle, web, and publish gates; build id `20260809010227`; no deployment.
- `python games/ddpdoj/tools/oracle/pgm.py check --quick`: all three W167 stages passed, with 52 total passes, four inherited failures, and zero skips. The unrelated current-HEAD failures were `STAGE 1 ENDS`, `THE CHAIN EXPIRES`, `THE BOMB`, and `THE LASER BOMB`; no gameplay source was changed here.
- Two full non-quick check attempts reached fresh MAME zoom capture work and exceeded the command timeout. Their exact process trees were stopped cleanly, with no process left running. No full non-quick green claim is made.
- `git diff --check` and Python compilation passed.

No gameplay source, `$29540C`, owner-decision bypass, sound, replay, hyper, bee, or Gradius behavior changed in this wave.
