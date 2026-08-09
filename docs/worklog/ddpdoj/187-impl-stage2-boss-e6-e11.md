# W187: Stage-2 boss E6-E11 attack leaves

Status: COMPLETE

## Scope

Statically close the six independent A1 leaf attacks E6 through E11, including
their timers, aim/RNG behavior, bullet-generator contracts, local tables,
assets, self-retirement, and next runtime frontier. Translate the complete
group as one delivery slice without duplicating analysis across address ranges.

## Starting state

- W186 is committed, pushed, and live as build `20260809160147`.
- The controlled boot consumes all 332 stage-2 records and stops at E6 INIT
  `$299E90`, clock `$0227`.
- Stage-2 spawn coverage is 332/332; enemy coverage is 44/256 and the bundle
  contains 2,919 sprite streams.
- The protected owner `c1_*.py` files and `NUL` remain out of scope.

## Static closure

Two disjoint read-only owners mapped E6-E8 and E9-E11. The implementation reads
one new data table and one contiguous code span:

- packed muzzle offsets `$2999B0..$299A30`
- E6-E11 code `$299E90..$29AF1A`

All six INIT routines fall through into STEP. The translation preserves byte
borrow timers, ignored aim carry with caller-X fallback, loop-specific bullet
geometry, packed-long carry, freeze behavior, call order, and slot retirement.
No new sprite, sound, palette, or web-harvest asset is required.

The next gameplay phase entries are F1 `$298CE2/$298D24`, F2
`$298DC2/$298E02`, and F8 `$299882/$2998AA`. Adjacent E12 is not called by F3.

## Implementation

- Added `src/boss2attacks.js` and registered all twelve INIT/STEP addresses.
- Imported the leaf module from `src/boss2.js`.
- Exported and SHA-pinned the exact new ROM windows.
- Updated W186's former frontier assertion to require E6 startup.
- Added focused E7 ordering and E10 cross-fire/retirement regressions.
- Updated the shared Stage 2 boot smoke to require continued execution and
  visible ROM-named boss bullet sites beyond the old E6 stop.

## Lean verification

The process audit removed repeated work without weakening product evidence:

- one static owner now owns code, dependencies, assets, and frontier for each
  disjoint address range
- normal ROM export is no longer preceded by a redundant verify-only run
- coverage and web asset export are skipped for code-only leaves
- focused regression and one cached real boot replace repeated broad suites

Results:

- ROM export green, 260 windows and 287,746 bytes
- W186 plus W187 focused checks: 6/6 green
- one 9,000-frame seeded boot crossed the old E6 frontier without an
  `Unreached`; observed E6 and E9 ROM call sites
- the same boot retained all 332 consumed stage records and 327 allocations

The expensive boot was not rerun after narrowing its new visible-output
assertion to the exact already-observed E6/E9 evidence.
