# W195: Stage-3 type $3C

Status: IN PROGRESS

## Scope

Use W192's complete static Stage-3 census to translate the next chronological
unsupported family, type `$3C` at record `$234512`, clock `$003B`, with its
directly reachable runtime and visible asset dependencies. Run one focused
behavior regression and one real Stage-3 spawn smoke.

## Starting state

- W194 is complete and live as build `20260810002237`.
- Stage 3 has 259/414 records and 16/28 enemy types translated.
- Type `$37` and all earlier records are live.
- The next unsupported record is `$234512`, type `$3C`, body `$266968`, handler
  `$2669E2`.

## Static findings

Type `$3C` occurs eight times in Stage 3. Its exact local closure is
`$266960..$266D2E`, SHA-256
`01bd1c76f9d4ede376b88b64c960b3384e677d434c196aea66e43553971865cd`.
The zero run length selects one sub-record. The init loads one long prototype,
18 record words, and one of two 42-byte movement streams.

The handler expands two attachments, runs four early or eight late attack
patterns, retracts, waits, and repeats. One leaf aims six separate muzzles;
the other fires six fixed headings, expanding to five bullets per muzzle on
Stage 4. The first pre-attack hit deliberately overwrites the damage result
with `$0C00` HP. Final death emits two kind-`$85` effects and one kind-`$0D`,
posts `$28C274`, and frees the record.

All runtime callees were already translated. The only new visible dependencies
are fixed streams `$174040`, `$1741CC`, and `$1742E8`. Their palette banks,
death-effect art, bullet generators, and sound are already shipped.

## Implementation

- Added init body `$266968` and handler `$2669E2`.
- Translated the cull latch, movement, damage/first-hit rule, four descending
  formation states, early/late dispatch tables, both six-muzzle bullet leaves,
  Stage-4 fan, three-sprite draw geometry, and death effects.
- Exported the complete local ROM closure with registry, occurrence, prototype,
  movement, death-table, boundary, and SHA checks.
- Harvested the three fixed sprite streams into deferred shard 17. The sprite
  inventory grows from 3,372 to 3,375 streams.
- Advanced reusable Stage-3 coverage to 267/414 records and 17/28 types;
  overall enemy-family coverage is now 48/256.

## Verification

- ROM/table export: green.
- Web asset export: green, 3,375 sprite streams.
- Focused open/pattern/freeze/death regression: green.
- Real clock-`$003B` Stage-3 smoke: green, consuming `$37`, `$10`, and `$3C`
  and advancing the script cursor to `$23451A`.
- Directly affected handler, init, integration, and coverage checks: 42/42 green.

## Result

All eight Stage-3 type `$3C` records now initialize, expand, fire both pattern
families, retract, explode, and draw with complete art. The next chronological
unsupported record is type `$3B` at `$23453A`, clock `$0048`, with body
`$264D5A` and handler `$264E82`. Stage 3 has 267/414 translated records,
leaving 147 records across 11 unsupported types.
