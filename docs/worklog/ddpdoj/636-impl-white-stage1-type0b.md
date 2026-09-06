# Task #284: White Label Stage 1 Type $0B

Status: **green for the focused source and table acceptance set**. White Label now runs the natural Type `$0B` Stage 1 enemy through the mature Black Label algorithm with edition-private initialization, movement, target aim, drawing, both firing phases, bullet continuation, combat ownership, effects, sound, and retirement.

## Shared algorithm and private resources

Type `$0B` now has canonical, recursively frozen Black and White descriptors. Initializer and handler map construction validate exact descriptor identity before gameplay mutation or cartridge access. Black keeps its static routes while the White world removes those routes and installs its own:

| Resource | Black Label | White Label |
| --- | ---: | ---: |
| Init stub | `$26AB98` | `$169C10` |
| Init body | `$26ABA0` | `$169C18` |
| Handler | `$26AD28` | `$169DA0` |
| Record prototype | `$26ACF6` | `$169D6E` |
| Sub-record prototype | `$26AD0C` | `$169D84` |
| Animation | `$269BB6` | `$168C2E` |
| Sprite table | `$269E48` | `$168EC0` |
| ARM-B art | `$269EC8` | `$168F40` |
| Muzzle table | `$269F48` | `$168FC0` |
| Record emitter | `$23D852` | `$13DBA0` |
| ARM-A emitter | `$23DF86` | `$13E2D4` |
| ARM-B emitter | `$23DF58` | `$13E2A6` |
| Adaptive bullet entry | `$2814AC` | `$1804F8` |
| Phase-zero bullet site | `$26AE0A` | `$169E82` |
| Phase-one bullet site | `$26AECC` | `$169F44` |
| Effect site | `$26AD5C` | `$169DD4` |
| Death sound | `$28C2A8` | `$18ADCE` |
| Free-enemy entry | `$263762` | `$1627DC` |

The implementation remains one shared Type `$0B` algorithm selected by edition-owned resources. No gameplay parameter deviation was found after relocation. White initialization derives its native spawn aim from White target and aim64 tables. White handling uses its own fire gate, muzzle data, bank-A adaptive bullet resources, score tables, Pool-B effect allocator, sound, and retirement entry.

The two native fire paths remain distinct. Phase zero aims D1 at a live player while taking muzzle index D2 from record byte `+$23`. Phase one does no target aim and takes both D1 and D2 from record byte `+$23`. Both spawn kind `$0D` through their edition-owned call sites.

## Natural White route

The direct gameplay fixture spawns the authentic record at `$131474`:

```text
record bytes:       01 79 00 0C 0B 00 00 23
trigger:            $0179
parameter:          $000C
type:               $0B
flags:              $00
auxiliary index:    $023
movement record:    $131A16
low dispatch row:   $1668F4
init stub/body:     $169C10 / $169C18
handler:            $169DA0
record prototype:   $169D6E
sub prototype:      $169D84
phase-zero fire:    $169E82
phase-one fire:     $169F44
```

Natural initialization installs record `$81364C`, sub-record `$81459C`, movement cursor `$131A1C`, handler `$169DA0`, position `$77801400`, HP `$0020`, speed `$24`, heading `$20`, palette `$0B`, record aim `$21`, fire counter `$20`, and fire reload `$50`. It advances the spawn cursor to `$13147C` without an unported route.

Direct phase-zero gameplay proves that a player aim different from record facing `$11` controls the projectile direction while White muzzle entry `$168FC0 + $24` controls the origin. Direct phase-one gameplay proves that record facing `$11` controls both direction and origin. The native record plus ARM-B draw route queues the expected requests. Phase one spawns exactly one rank-zero kind `$0D` bullet with type `$810D`, graphic `$0418`, attribute `$001A`, and speed `$14`. The first bullet-driver frame installs continuation `$181932`; the second dispatches that continuation, preserves it, and moves the live projectile.

The lethal P2 route preserves native ownership: kill event `[0x08, 0x08]`, zero P1 score, packed-BCD `$09` P2 score including the hit point, Pool-B kind `$02` effect at site `$169DD4`, death sound `$18ADCE`, and ordinary `freeEnemy` retirement. The effect inherits the enemy's exact position.

## Exact sparse table adoption

Four exact Build A windows add 66 declared bytes, all below `$200000`:

- `$1668F4 + $0008`: low type-table entry `$0B`
- `$169C10 + $0008`: run-length initializer stub
- `$169D6E + $0016`: enemy-record prototype
- `$169D84 + $001C`: sub-record prototype

All four windows are disjoint. Every tracked White cartridge read fits wholly inside one declared window. The exact half-open executable identities are:

- Init `[$169C10,$169DA0)`: `09a0806425dbfadaa971aa1fd4cbb7041e1845fd9b85e44081c2da008a5af0df`
- Handler `[$169DA0,$169F9E)`: `469b8995d477c8dda9c1078290c761781a7daa0474ed46e045b290c9c847e4b4`

The regenerated canonical JSON identity is SHA-256 `3dc61829340086e80eb68c7d04cec4cc2cf2e43295f86f1789c065e4efdcf918`. Current cardinalities are:

- Global: 1,848 windows and 663,063 bytes
- White: 894 windows and 205,266 bytes
- White world runtime: 192 windows
- Overlap pairs: 80
- Historical Black: 950 windows and 457,529 bytes
- Black runtime projection: 954 windows and 457,797 bytes

Only current generated-table identity and cardinality pins changed. Historical identities, values, ledger prose, and overlap accounting remain unchanged.

## Focused verification

Tables were regenerated in the required order:

1. `python games/ddpdoj/tools/export-tables.py`
2. `node games/ddpdoj/tools/export-web.mjs`
3. `python games/ddpdoj/tools/export-tables.py --verify`

The final verifier reported 100 reachable spawn templates, 1,848 ROM windows, 663,063 declared bytes, and `VERIFY OK`.

The explicit serial integration command covered only:

- `games/ddpdoj/tests/white-stage1-enemy0b.test.js`
- `games/ddpdoj/tests/w36handlers.test.js`
- `games/ddpdoj/tests/white-bullets.test.js`
- `games/ddpdoj/tests/edition-profile.test.js`

Result: 45/45 tests passed. Direct Type `$0B` coverage remains exactly three combined tests: descriptor, manifest, sparse authority, and natural spawn; drawing, distinct phase-zero and phase-one fire, and bullet continuation; and lethal P2 ownership, effect, sound, and retirement.

A final `npm run typecheck` passed. `git diff --check` passed. White Label remains disabled and unpublished.
