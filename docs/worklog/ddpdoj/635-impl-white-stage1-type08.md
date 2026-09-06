# Task #283: White Label Stage 1 Type $08

Status: **green for the focused source and table acceptance set**. White Label now runs the natural Type `$08` Stage 1 enemy through the mature Black Label algorithm with edition-private initialization, movement, target aim, both sprite arms, adaptive fire, bullet continuation, combat ownership, effects, sound, and retirement.

## Shared algorithm and private resources

Type `$08` now has canonical, recursively frozen Black and White descriptors. Initializer and handler map construction validate exact descriptor identity before gameplay mutation or cartridge access. Black keeps its static routes while the White world removes those routes and installs its own:

| Resource | Black Label | White Label |
| --- | ---: | ---: |
| Init stub | `$26A4B4` | `$16952C` |
| Init body | `$26A4BC` | `$169534` |
| Handler | `$26A5E4` | `$16965C` |
| Record prototype | `$26A5B2` | `$16962A` |
| Sub-record prototype | `$26A5C8` | `$169640` |
| Animation | `$269BB6` | `$168C2E` |
| Sprite table | `$269E48` | `$168EC0` |
| ARM-B art | `$269EC8` | `$168F40` |
| Muzzle table | `$269F48` | `$168FC0` |
| Record emitter | `$23D852` | `$13DBA0` |
| ARM-A emitter | `$23DF86` | `$13E2D4` |
| ARM-B emitter | `$23DF58` | `$13E2A6` |
| Adaptive bullet entry | `$2814AC` | `$1804F8` |
| Effect site | `$26A618` | `$169690` |
| Death sound | `$28C2A8` | `$18ADCE` |
| Free-enemy entry | `$263762` | `$1627DC` |

The implementation remains one shared Type `$08` algorithm selected by edition-owned resources. Black preserves its mature fallback spawn heading, while White derives its native spawn aim from the White target and aim64 tables. White fire uses its own fire gate, muzzle data, bank-A adaptive bullet resources, score tables, Pool-B effect allocator, sound, and retirement entry.

## Natural White route

The direct gameplay fixture spawns the authentic record at `$131464`:

```text
record bytes:       01 78 00 08 08 00 00 23
trigger:            $0178
parameter:          $0008
type:               $08
flags:              $00
auxiliary index:    $023
auxiliary cell:     $131752 = $01C4
movement record:    $131A16
low dispatch row:   $1668DC
init stub/body:     $16952C / $169534
handler:            $16965C
record prototype:   $16962A
sub prototype:      $169640
bullet site:        $1697FA
```

Natural initialization installs record `$81364C`, sub-record `$81459C`, movement cursor `$131A1C`, handler `$16965C`, position `$77800C00`, HP `$0020`, speed `$1D`, heading `$20`, palette `$0B`, and advances the spawn cursor to `$13146C`.

A live transition reaches state word `1`, cooldown `$0F`, and heading `$10`. The native record plus ARM-A route queues two requests; record plus ARM-B queues one request in each expected bucket. Adaptive fire at `$1697FA` spawns exactly one rank-zero kind `$0D` bullet with type `$810D`, graphic `$0418`, attribute `$001A`, speed `$17`, and its position from the White muzzle table. The first bullet-driver frame installs continuation `$181932`; the second dispatches that continuation, preserves it, and moves the live projectile.

The lethal P2 route preserves native ownership: kill event `[0x08, 0x08]`, zero P1 score, packed-BCD `$09` P2 score including the hit point, Pool-B kind `$02` effect at site `$169690`, death sound `$18ADCE`, and ordinary `freeEnemy` retirement. The effect inherits the enemy's exact position.

## Exact sparse table adoption

Four exact Build A windows add 66 declared bytes, all below `$200000`:

- `$1668DC + $0008`: low type-table entry `$08`
- `$16952C + $0008`: run-length initializer stub
- `$16962A + $0016`: enemy-record prototype
- `$169640 + $001C`: sub-record prototype

All four windows are disjoint. Every tracked White cartridge read fits wholly inside one declared window. The exact half-open executable identities are:

- Init `[$16952C,$16965C)`: `1c722f8e7a4b1a187bcd2d61cf70628aaaa12762ab5df2d4c25e216e82064ac7`
- Handler `[$16965C,$169804)`: `74c6e466a777e1bde99b104bf3273df03cdc9ad1761efb73675fa7ec8e4a93b3`

The regenerated canonical JSON identity is SHA-256 `ad7d60dbeea674f93109348687331a3c127ab91bb6390011fed3b5afb253fe4d`. Current cardinalities are:

- Global: 1,844 windows and 662,997 bytes
- White: 890 windows and 205,200 bytes
- White world runtime: 188 windows
- Overlap pairs: 80
- Historical Black: 950 windows and 457,529 bytes
- Black runtime projection: 954 windows and 457,797 bytes

Only current generated-table identity and cardinality pins changed. Historical identities, values, ledger prose, and overlap accounting remain unchanged.

## Focused verification

Tables were regenerated in the required order:

1. `python games/ddpdoj/tools/export-tables.py`
2. `node games/ddpdoj/tools/export-web.mjs`
3. `python games/ddpdoj/tools/export-tables.py --verify`

The final verifier reported 100 reachable spawn templates, 1,844 ROM windows, 662,997 declared bytes, and `VERIFY OK`.

The explicit serial integration command covered only:

- `games/ddpdoj/tests/white-stage1-enemy08.test.js`
- `games/ddpdoj/tests/w36handlers.test.js`
- `games/ddpdoj/tests/white-bullets.test.js`
- `games/ddpdoj/tests/edition-profile.test.js`

Result: 45/45 tests passed. Direct Type `$08` coverage remains exactly three combined tests: descriptor, manifest, sparse authority, and natural spawn; live transition, both draw arms, adaptive fire, and bullet continuation; and lethal P2 ownership, effect, sound, and retirement.

`npm run typecheck` passed after the final source changes. `git diff --check` passed. White Label remains disabled and unpublished.
