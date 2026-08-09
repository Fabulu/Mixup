# W183: Stage-2 type `$30`

Status: COMPLETE

## Scope

Statically map and port the type `$30` boss entry at the final unsupported
stage-2 record `$233020`, clock `$01DC`, init body `$297120`, handler `$297398`,
and movement index `$000`. Close the stage-2 enemy-script denominator, translate
the complete multi-part controller and arrival MAIN 0, and stop at the next
honest internal boss dependency without claiming the full boss is complete.

## Starting state

- W182 is committed, pushed, and live as build `20260809124334`.
- Stage-2 coverage is 331/332 records with 1 unknown.
- The seeded boot completes 330 records and stops at `$297120`.
- The protected owner `c1_*.py` files and `NUL` remain out of scope.

## Static analysis first

- Type `$30` occurs exactly once across all five stage scripts, at `$233020`.
  The already-ported type `$31` record at `$233028` follows it, then the stage-2
  `$FFFFFFFF` terminator at `$233030`.
- The entry closure is `$297118..$2973B8`: run-length stub, init, three-word
  record prototype, twelve long-form sub-record prototypes, and handler wrapper.
- `$297432` supplies eleven A2 routines; `$297950`, `$297EE0`, and `$298C66`
  are the MAIN, A3, and A4 tables installed by the init.
- The complete damage/controller closure is `$298310..$298C66`. Static control
  flow identified its linked-hitbox maximum-damage rule, four detachable-part
  deaths, phase thresholds, timeout, and whole-boss death arm before code was
  written.
- A4 script 0 starts MAIN 0 and D scripts 0, 2, 11, 12, and 13. MAIN 0 is the
  compact arrival program `$297A10..$297AE6` with shared placement tail
  `$297990..$297A10`. Once translated, scheduler order exposes D0 init
  `$297F54` as the next strict frontier.
- No new sprite stream is reachable from this entry/controller/arrival closure.
  All effect art is already owned by the existing pool-B and boss shards.

## Delivered

- Registered type `$30` init `$297120` and handler `$297398`.
- Copied all twelve prototypes, installed the five scheduler roots, armed all
  eleven A2 objects, installed six sprite banks, and reproduced every boss
  ownership/global write made by the init.
- Added exact `$2598FE` run-all and `$2598BE` MAIN-stop scheduler primitives.
- Translated the complete `$298310` controller, including grouped snapshot
  damage using the largest delta once, detachable-part scoring/effects, phase
  latches, low-HP transition, timeout behavior, and the whole-boss death setup.
- Translated A4 bootstrap `$298CAE/$298CDE`, arrival MAIN 0
  `$297A10/$297A28`, all eight child-placement offsets, the bank-$0D arrival
  install, acceleration/cap, activation flags, and six-entry palette animation.
- Extended the scheduler membership invariant from the stage-1 boss alone to
  both installed bosses' statically bounded ROM tables.
- Closed stage-2 spawn coverage at 332/332 records with zero unknown and raised
  enemy-type coverage to 43/256.

## ROM boundaries

- `$297118..$2973B8`, SHA-256
  `578e3ee78b5a9da04e1dd90ac30475f09db7b4832e0d74bc501ea08e2b93a5fb`.
- `$298310..$298C66`, SHA-256
  `bad73d89fe5e46cce77cab56016493ff26885d82e35c50226aa83b30eaa5d1e4`.
- `$297990..$297AE6`, SHA-256
  `66ff45652d24f7252e56f91047db668efdee1442aa7ad5de7211918167c03f72`.
- `$297E8A..$297F50`, SHA-256
  `aa13215ca244735302855fca321316edc47bc3659a3de836e15befeb3342aa25`.

## Verification and release

- 1,519 DDPDOJ tests are green. The initial full run exposed one old
  stage-1-only scheduler-membership assertion; its focused file re-passed after
  widening the invariant to both ROM tables, while the other 1,518 checks were
  already green.
- ROM export verification, static/dynamic coverage, controlled stage-2 boot,
  and the focused W183 init/controller/MAIN tests pass.
- The controlled boot consumes 331 records with 326 allocations and five
  authentic declines, advances the cursor to `$233028`, and stops at D0 init
  `$297F54` at clock `$01DC`.
- The bundle remains 2,743 streams. Pixel parity is 15,955,968/15,955,968,
  100.0000%; the HTTP fetch/render gate passes.
- The ROM-leak guard checked 285 files against 12 ROMs and stayed clean with
  the six existing deliberate exceptions.
- Implementation commit: `035efc4` (`ddpdoj: port stage 2 boss entry`).
- Live build: `20260809140956`, confirmed by three consecutive production-edge
  polls at `https://gbtman.pages.dev/games/ddpdoj/`.

## Next frontier

The stage-2 spawn script is complete, but the boss is not. Continue with a
static map of A3/D script 0 init `$297F54` and step `$297F60`, then follow the
installed scheduler graph through the remaining stage-2 boss attacks, death,
and stage transition.
