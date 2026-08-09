# W186: Stage-2 boss A4/F3

Status: COMPLETE

## Scope

Statically map A4/F3 init `$299194` and step `$2991BC`, including every state
field, branch, timer, script start/stop, projectile/effect dependency, table,
and next runtime frontier. Translate only after its transitive static boundary
is closed, then continue through the stage-2 boss attack graph.

## Starting state

- W185 is committed, pushed, and live as build `20260809151417`.
- The controlled boot stops at `$299194`, clock `$0218`.
- Stage 2 remains 332/332 spawn records with zero unknown; enemy coverage is
  44/256 and the web bundle contains 2,919 sprite streams.
- The protected owner `c1_*.py` files and `NUL` remain out of scope.

## Static analysis first

- F3 is exactly `$299194..$2993B4`. INIT falls through into STEP and spends
  the first call of its `$40` startup countdown immediately.
- Its fixed opening starts MAIN2 and D3 in the same scheduler pass. Because the
  walk order is A4, MAIN, A1, A3, A2, stopping at either tiny dependency would
  have produced two artificial micro-waves. Both were closed and translated in
  this slice.
- F3's random attack table is `(E6,$40), (E7,$A0), (E8,$40), (E9,$30)`.
  After three distinct selections it alternates the E10/E11 cadence phase.
- States 1 and 4 have no producer. The state-4 reset tail is retained literally
  but no invented transition reaches it.
- MAIN2 walks sixteen `(Y,X)` waypoints at `$297BA8`, turns one heading step per
  call, applies velocity, and chooses the next point only within distance
  `$100`. D3 rotates the center heading by a signed random `+1/-1` modulo `$40`.
- No new sprite, sound, or effect assets are required. E6 through E11 are leaf
  bullet-pattern scripts over already translated generators and existing art.

## Delivered

- Registered F3 INIT/STEP `$299194/$2991BC`, MAIN2 `$297B22/$297B48`, and D3
  `$29804C/$298066`.
- Preserved same-call fall-through, silent A1 overflow writes, scheduler-call
  timers, random-choice rejection, byte underflow cadence, loop-2 D13 stop,
  dormant state-4 code, sixteen-waypoint movement, and signed D3 direction.
- Exported the three code/data closures and the complete fourteen-pair A1 table
  so the next unknown resolves by its real address instead of failing on a
  missing pointer read.
- The controlled boot now consumes all 332 stage-2 records and stops honestly
  at A1/E6 INIT `$299E90`, clock `$0227`.

## Leaner delivery process

- The W133 smoke previously performed the same immutable 25-30 second stage-2
  boot twice. Its two dynamic assertions now share one result. The unchanged
  four-test smoke fell from about 57 seconds to 22 seconds.
- Normal `export-tables.py` already verifies every invariant before writing, so
  the redundant preceding `--verify` run was removed from the workflow.
- Boss-only slices no longer run unchanged reusable-coverage reports or rebuild
  assets during implementation. Asset export happens only after harvest changes
  or once at the publish boundary.
- One static owner now closes code, dependency graph, assets, and next frontier
  for a disjoint address range. Compact same-frame dependencies are grouped
  into the same delivery instead of becoming one-call publications.
- The full suite remains mandatory at the release boundary. It caught four
  stale W185 type-$4D registry totals; those now name `$29BB26/$29BB64` and the
  current 44/256 enemy-type coverage explicitly.

## ROM boundaries

- MAIN2 `$297B22..$297BE8`, SHA-256
  `fab498c2d60bc352cd1a58b9726d70ebe2f94f7862912971a9ee3aee9aec65a5`.
- D3 `$29804C..$298076`, SHA-256
  `85d69b11b21a803a58af02d31ae47ebe95f3408835fd5fe0b467cd91c1065e5d`.
- F3 and its choice table `$299194..$2993B4`, SHA-256
  `09ad6e637a4910a60ac57a29618feba9a50797b71d57e5407682068825431c6d`.
- Complete A1 table `$2998AC..$29991C`, SHA-256
  `550da5d7fa3124b242965f654b46fca2619cddb789147295c3d16b563245d85e`.

## Verification and release

- Six focused W185/W186 checks pass, including exact pointer tables, same-pass
  MAIN2/D3 dispatch, and the E6 frontier.
- The four-assertion seeded product smoke passes with one shared boot.
- ROM export covers 258 windows and 283,384 bytes. The sprite bundle remains
  2,919 streams because W186 adds no art.
- The release gate passes all 1,527 tests, 100.0000% bundle parity, HTTP fetch,
  the 285-file/12-ROM leak guard with six existing exceptions, deployment, and
  three consecutive live confirmations.
- Implementation commits: `12ac1f0` and registry-total correction `d1d3e77`.
- Live build: `20260809160147`, deployment
  `https://07420017.gbtman.pages.dev`. Production serves the build and Gradius
  returns HTTP 200.

## Next frontier

Translate the six independent F3 leaf attacks E6 through E11 as one grouped,
static-first slice. The first runtime stop is E6 INIT `$299E90`.
