# W218: Stage-4 Type $9F

Status: COMPLETE

## Scope

Translate the sole Stage-4 Type `$9F` record at `$2361F0`, including its exact
init, handler, direct live dependencies, visible assets, and the final Stage-4
spawn frontier. Reuse the completed Stage-4 census.

## Starting state

- W216 is live as build `20260810101650`; W217 Type `$A1` is committed and
  intentionally batched into the Stage-4 completion publication.
- Stage 4 covers 380/382 spawn records and 27/29 script types.
- Type `$9F`: clock `$0266`, body `$27C5BE`, handler `$27C81A`, movement
  `$2367DA..$2367E0`.

## Delivered

- Registered and translated the complete Type `$9F` init and handler, including
  its three linked subrecords, signed-minimum damage sharing, armor interval,
  threshold cues, opening animation, palette chains, staged death, randomized
  debris, final two-position blast, and explicit animation-chain cleanup.
- Registered and translated the live deferred Type `$A4` fragment. Its motion
  uses the ROM's variable-shift shot-vector entries, parent-relative draw
  position, speed decay, palette toggle, and exact arithmetic sprite range.
- Added the mode-zero `$24652A` palette-animation loader and `$246800` explicit
  chain release without changing the existing mode-one `$246520` behavior.
- Exported both complete runtime closures and all 42 reachable art references.
  The 24 fragment frames are already members of the bomb/hyper family, so the
  final bundle adds only the 18 unique Type `$9F` structure streams: 3,804 to
  3,822 total.
- Corrected the state-1 transition timing found during implementation review:
  the transition branches directly to drawing and does not grow the structure
  on that same call.

## Focused verification

- `node --test games/ddpdoj/tests/w218stage4.test.js`
  - pins the Type `$9F` and `$A4` closures, registry rows, real record and
    movement, art harvest, and final bundle count;
  - runs the real clock `$0266` three-record spawn batch;
  - verifies linked damage, live deferred fragment allocation, shifted-vector
    motion, and the next fragment animation frame.
- The narrow Stage-4 integration set W211 through W218 is green: 17/17 checks.
- No full suite was run. The focused checks cover the changed runtime and asset
  boundaries.

## Result and next frontier

- Stage 4 now covers 381/382 spawn records and 28/29 script types.
- The next and final Stage-4 spawn frontier is Type `$40`, the stage boss.
