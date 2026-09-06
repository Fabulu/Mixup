# Task #290: White Label Type `$82` aim and primary fire

Status: **implemented and focused acceptance green**. The natural White Stage 1 Type `$82` record at `$13106C` now completes its native initializer aim and primary Aim256 fan without unsupported calls.

## Shared behavior and White resources

The mature Black Type `$82` algorithm now consumes canonical edition-owned resources. White binds its native Aim256 graph, bullet generators, call sites, and speed parameters:

| Resource | Black Label | White Label |
| --- | ---: | ---: |
| Init aim call | `$24200A` | `$142344` |
| Aim256 core | `$2422A2` | `$1425DC` |
| Base kind `$0C` D0 | `$0003000C` | `$0005000C` |
| Plus-four kind `$0D` D0 | `$FFFD000D` | `$FFFF000D` |
| Plus-four generator | `$281708` | `$180746` |
| Spread-two generator | `$281764` | `$180782` |

The initializer uses the shared Aim64 implementation with White cartridge tables. It keeps the movement heading only when neither player is alive and selects the corresponding native sprite-table entry.

The primary fan preserves native target selection and dead-player fallback. It calculates independent left and right Aim256 directions, fires either two spread-two calls below Stage 3 or four plus-four calls at Stage 3 and later when the salvo counters match, and retains the exact White speeds, muzzle offsets, call sites, and byte-underflow cadence. P2 can own both target coordinates without changing bullet ownership.

A dedicated ROM-plus-descriptor Aim256 cache prevents the primary block from materializing unused Aim64 tables. All cartridge resources remain canonical and recursively frozen.

## Sparse Build A authority

The focused fixture records every cartridge access. Each White read ends below `$200000` and fits wholly within one declared `RomWindows` descriptor. Adjacent and overlapping descriptors are not stitched, and executable bodies are used only as pinned identities.

The existing executable ledger remains exact:

- Init `[$173676,$17381A)`: `32a2859d0e0c79a09c0e8e5569b516cea97470865a271800ff0a0f974d4b9f9b`
- Handler `[$17381A,$173BC0)`: `c871a325f02618695ad45556fb92121229d0220176cd9b0546495f14f6725b65`

No cartridge tables or generated assets changed.

## Focused verification

```text
node --test --test-concurrency=1 games/ddpdoj/tests/white-stage1-enemy82.test.js
# tests 5
# pass 5
# fail 0

node --test --test-concurrency=1 games/ddpdoj/tests/w439secondfire82.test.js
# tests 12
# pass 12
# fail 0

npm run typecheck
> mixup@0.1.0 typecheck
> tsc -p tsconfig.json
```

White Label remains disabled and unpublished.
