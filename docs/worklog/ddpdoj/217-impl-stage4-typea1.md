# W217: Stage-4 Type $A1

Status: COMPLETE

## Scope

Translate the sole chronological Stage-4 Type `$A1` record at `$2360D8`,
including its exact init, handler, direct live dependencies, visible assets,
and next unsupported frontier. Reuse the completed Stage-4 census instead of
rescanning the stage.

## Starting state

- W216 is complete and live as build `20260810101650`.
- Stage 4 covers 379/382 spawn records and 26/29 script types.
- Type `$A1`: clock `$0236`, body `$27CEB4`, handler `$27CF0C`, movement
  `$2367D4..$2367DA`.

## Delivered

- Translated the complete `$27CEAC..$27CFA4` family: run-length stub, body,
  record and long-form subrecord prototypes, handler, and exact 16-entry
  animation table.
- Preserved movement, the two-add carry lifetime gate, old-zero byte timer,
  reverse `$3C..$00` animation cursor, bucket-1 emitter, and palette-bank `$12`
  install from `$224CF8`.
- Exported all sixteen reachable structure frames. None overlapped the prior
  bundle, bringing it from 3,788 to 3,804 streams.
- Stage 4 now covers 380/382 spawn records and 27/29 script types. Enemy
  registry coverage is 72/256.

## Verification

- Focused static and real clock `$0236` regression: 2/2 passed.
- The real smoke proves the palette install, first frame at cursor `$3C`,
  reverse animation, bucket-1 draw, latch arm, and later re-entry retirement.
- Affected registry, coverage, asset, and prior Stage-4 checks: 53/53 passed.

## Next frontier

The next unsupported Stage-4 record is Type `$9F` at `$2361F0`, clock `$0266`,
raw `026600009F811011`. Registry row `$27E50A` points to stub/body
`$27C5B6/$27C5BE` and handler `$27C81A`; movement index `$011` resolves to
`$2367DA..$2367E0`, raw `B80024004000`.

Publication is intentionally batched with the two-record Stage-4 closure so a
second full release gate is not spent on this compact standalone object.
