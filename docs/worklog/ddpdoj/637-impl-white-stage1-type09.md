# Task #285: White Label Stage 1 Type $09

Status: **green for the focused source and table acceptance set**. White Label now runs the natural Type `$09` Stage 1 enemy through the mature Black Label algorithm with edition-private initialization, movement, target aim, drawing, state transition, firing, bullet continuation, combat ownership, effects, sound, and retirement.

## Shared algorithm and private resources

Type `$09` now has canonical, recursively frozen Black and White descriptors. Initializer and handler map construction validate exact descriptor identity before gameplay mutation or cartridge access. Black keeps its static routes while the White world removes those routes and installs its own:

| Resource | Black Label | White Label |
| --- | ---: | ---: |
| Init stub | `$26A78C` | `$169804` |
| Init body | `$26A794` | `$16980C` |
| Handler | `$26A860` | `$1698D8` |
| Record prototype | `$26A82E` | `$1698A6` |
| Sub-record prototype | `$26A844` | `$1698BC` |
| Animation | `$269BB6` | `$168C2E` |
| Sprite table | `$269E48` | `$168EC0` |
| ARM-B art | `$269EC8` | `$168F40` |
| Muzzle table | `$269F48` | `$168FC0` |
| Record emitter | `$23D852` | `$13DBA0` |
| ARM-A emitter | `$23DF86` | `$13E2D4` |
| ARM-B emitter | `$23DF58` | `$13E2A6` |
| Adaptive bullet entry | `$2814AC` | `$1804F8` |
| Bullet site | `$26A93E` | `$1699B6` |
| Effect site | `$26A894` | `$16990C` |
| Initial type-bit-5 aim | `$242A80` | `$142DD0` |
| Target aim | `$24202C` | `$142366` |
| Death sound | `$28C2A8` | `$18ADCE` |
| Free-enemy entry | `$263762` | `$1627DC` |

The implementation remains one shared Type `$09` algorithm selected by edition-owned resources. Binary comparison found no opcode, immediate, prototype, or gameplay-parameter deviation after relocation. The initializer differs only at six absolute targets and the handler only at thirteen absolute targets. White initialization derives its native spawn aim from White target and aim64 tables. White handling uses its own fire gate, muzzle data, bank-A adaptive bullet resources, score tables, Pool-B effect allocator, sound, and retirement entry.

## Natural White route

The direct gameplay fixture spawns the first authentic Type `$09` record at `$13154C`:

```text
record bytes:       01 A4 00 1A 09 00 00 23
trigger:            $01A4
parameter:          $001A
type:               $09
flags:              $00
auxiliary index:    $023
auxiliary value:    $01C4
movement record:    $131A16
low dispatch row:   $1668E4
init stub/body:     $169804 / $16980C
handler:            $1698D8
record prototype:   $1698A6
sub prototype:      $1698BC
bullet site:        $1699B6
```

Natural initialization installs record `$81364C`, sub-record `$81459C`, movement cursor `$131A1C`, handler `$1698D8`, position `$77803000`, HP `$0020`, speed `$1D`, heading `$20`, palette `$0B`, record aim `$27`, and phase word `$0102`. It advances the spawn cursor to `$131554` without an unported route.

Direct gameplay drives the native speed-zero transition. The enemy enters phase one, installs phase word `$0002`, cooldown word `$3008`, delay `$30`, and target heading `$0D`. The record plus ARM-A route emits both native draw requests. A separate phase-zero frame exercises record plus ARM-B drawing and fires exactly one aimed kind `$0D` bullet at site `$1699B6`. The bullet has type `$810D`, graphic `$0418`, attribute `$001A`, and speed `$14`; its origin comes from the aim-selected White muzzle entry plus the enemy position. The first bullet-driver frame installs continuation `$181932`; the second dispatches that continuation, preserves it, and moves the live projectile.

The lethal P2 route preserves native ownership: kill event `[0x08, 0x08]`, zero P1 score, packed-BCD `$09` P2 score including the hit point, Pool-B kind `$02` effect at site `$16990C`, death sound `$18ADCE`, and ordinary `freeEnemy` retirement. The effect inherits the enemy's exact position.

## Exact sparse table adoption

Four exact Build A windows add 66 declared bytes, all below `$200000`:

- `$1668E4 + $0008`: low type-table entry `$09`
- `$169804 + $0008`: run-length initializer stub
- `$1698A6 + $0016`: enemy-record prototype
- `$1698BC + $001C`: sub-record prototype

All four windows are disjoint. Every tracked White cartridge read fits wholly inside one declared window. The exact half-open executable identities are:

- Init `[$169804,$1698D8)`: `fd0daf32b411dac85eb2581b6bb45f13ea969a800fb7ce9404397be837ea7f92`
- Handler `[$1698D8,$169A40)`: `1a3ebad7c89aacd72fed85ecaf740add68358e04016e4092b51776cb034659d2`

The regenerated canonical JSON identity is SHA-256 `28d33479ee2f7dc67959e558790b86dc98a100522b13ed102eb2d6e35d532ef8`. Current cardinalities are:

- Global: 1,852 windows and 663,129 bytes
- White: 898 windows and 205,332 bytes
- White world runtime: 196 windows
- Overlap pairs: 80
- Historical Black: 950 windows and 457,529 bytes
- Black runtime projection: 954 windows and 457,797 bytes

Only current generated-table identity and cardinality pins changed. Historical identities, values, ledger prose, and overlap accounting remain unchanged.

## Focused verification

Tables were regenerated in the required order:

1. `python games/ddpdoj/tools/export-tables.py`
2. `node games/ddpdoj/tools/export-web.mjs`
3. `python games/ddpdoj/tools/export-tables.py --verify`

The final verifier reported 100 reachable spawn templates, 1,852 ROM windows, 663,129 declared bytes, and `VERIFY OK`.

The explicit serial integration command covered only:

- `games/ddpdoj/tests/white-stage1-enemy09.test.js`
- `games/ddpdoj/tests/w36handlers.test.js`
- `games/ddpdoj/tests/white-bullets.test.js`
- `games/ddpdoj/tests/edition-profile.test.js`

Result: 45/45 tests passed. Direct Type `$09` coverage remains exactly three combined tests: descriptor, manifest, sparse authority, and natural spawn; transition, both drawing arms, aimed kind `$0D` fire, and bullet continuation; and lethal P2 ownership, effect, sound, and retirement.

A final `npm run typecheck` passed. `git diff --check` passed. White Label remains disabled and unpublished.
