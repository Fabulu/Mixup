# W182: Stage-2 type `$86`

Status: COMPLETE

## Scope

Port the dependency-complete type `$86` family at the first chronological
unsupported stage-2 record `$233018`, clock `$01D5`, init body `$275BB6`,
shared handler `$275914`, and movement index `$002`. Verify the Version-B ROM
closure and advance the controlled boot to the final unsupported stage-2 record.

## Starting state

- W181 is committed, pushed, and live as build `20260809114953`.
- Stage-2 coverage is 330/332 records with 2 unknown.
- The seeded boot completes 329 records and stops at `$275BB6`.
- The protected owner `c1_*.py` files and `NUL` remain out of scope.

## Delivered

- Registered init body `$275BB6` for type `$86` and translated its exact
  movement, two shared long-form prototypes, eleven-word record prototype,
  `$24200A` aimed heading selection, five palette pairs, and 32-entry heading
  art selection.
- Corrected the shared type `$85/$86` cue cursor to the `$2637A2` return value
  `$2758E8`. The old code pointed inside prototype two at `$2758CC`.
- Replaced the shared handler's counted `$28AC72` note with the already-ported
  word-threshold cue spawner, preserving all three type `$86` cue records.
- Preserved the handler's only type-dependent branch: type `$86` always drops
  item kind `$08`, then creates effects `$05/$0C/$84`, posts `$28C274`, and
  frees immediately.
- Exported the exact `$275BAE..$275C32` local closure and widened the shared
  `$275890..$275914` data window through its `$FFFF` cue terminator. Added the
  exact next type `$30` stub at `$297118`.
- Advanced static coverage to 42/256 enemy types and 331/332 stage-2 records.
  The controlled boot consumes 330 records, allocates 325, authentically
  declines five, and stops at type `$30` body `$297120`, clock `$01DC`.

## ROM and asset boundary

- Local closure: `$275BAE..$275C32`, `$84` bytes, SHA-256
  `03b416693fba65eca7cb04d3d880cb9104a73c82ea2599c7e1a7319c42f39dae`.
- Shared data: `$275890..$275914`, including palettes, record prototype, two
  sub-record prototypes, three 14-byte threshold cues, and `$FFFF`.
- Type `$86` also occurs in stages 3, 4, and 5, so this family translation
  carries forward when those scripts become executable.
- All required body, heading, cue, item, and effect art was already present in
  the 2,743-stream bundle. No new sprite harvest was needed.

## Verification and release

- Focused ROM/init/cue/death tests pass, including the guaranteed kind `$08`
  drop and the true `$2758E8` cue cursor.
- DDPDOJ release suite: 1,515 passed, zero failed, zero skipped.
- ROM export verification, coverage, controlled stage-2 boot, 100% bundle pixel
  parity, HTTP/web rendering, and ROM-leak guard pass.
- The web scenario's structure-heading diversity changed from 101 to 97 because
  the ROM-exact init aim replaced the old movement-heading fallback. Record
  count, first frame, drawn count, and missing-art count remain exact.
- Implementation commit: `53c783a` (`ddpdoj: port stage 2 type 86`).
- Live build: `20260809124334`, confirmed by three consecutive production-edge
  polls at `https://gbtman.pages.dev/games/ddpdoj/`.

## Next frontier

The last unsupported stage-2 enemy record is `$233020`, clock `$01DC`, type
`$30`, movement index `$000`, stub/body `$297118/$297120`, handler `$297398`.
Its run-length stub requests twelve sub-records. Completing that record closes
the stage-2 spawn-script denominator, but not the stage-2 boss/end or the full
game objective.
