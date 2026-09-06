# Task #286: White Label Stage 1 Type $24

Status: **green for the focused source and table acceptance set**. White Label now runs the natural Type `$24` Stage 1 boss-approach prop through the mature Black Label algorithm with edition-private initialization, palette data, movement resources, drawing, phase transition, and retirement.

## Shared algorithm and private resources

Type `$24` now has canonical, recursively frozen Black and White descriptors. Initializer and handler map construction validate exact descriptor identity before cartridge access or gameplay mutation. Black keeps its static routes while the White world removes those routes and installs its own:

| Resource | Black Label | White Label |
| --- | ---: | ---: |
| Init stub | `$296FA8` | `$1959DE` |
| Init body | `$296FB0` | `$1959E6` |
| Handler | `$29700C` | `$195A42` |
| Sub-record prototype | `$296FF2` | `$195A28` |
| Palette block | `$222BF8` | `$122BF8` |
| Palette site | `$296FC6` | `$1959FC` |
| Palette installer | `$24150A` | `$141844` |
| Scroll compensation | `$24179E` | `$141AD8` |
| Direct velocity | `$2417DE` | `$141B18` |
| Bucket-0 emitter | `$23DECE` | `$13E21C` |
| Animated sprite table | `$2970D8` | `$195B0E` |
| Free-enemy entry | `$263762` | `$1627DC` |

Both editions retain fixed sprite `$0007E8AC`, packed tail bias `$FDC00080`, size `$1488`, and palette bank `$13`. Raw binary differences consist only of nine relocated absolute operands at four init offsets and five handler offsets. After those operands are normalized, the two init bodies and the two handlers are byte-identical. There are no opcode, branch, immediate, prototype, palette, movement, art, or lifecycle deviations.

The shared initializer now also preserves the native final `+$0200` X adjustment after reading initial movement state. This instruction was common to both cartridges but absent from the previous Black-only translation.

## Natural White route

The direct gameplay fixture spawns the only authentic White Stage 1 Type `$24` record:

```text
record address:      $1316EC
record bytes:        01 D0 00 00 24 01 00 96
trigger:             $01D0
parameter:           $0000
type:                $24
flags:               $01
auxiliary index:     $096
auxiliary cell:      $131838 = $0C28
movement resource:   $13247A
low dispatch row:    $1669BC
init stub/body:      $1959DE / $1959E6
handler:             $195A42
```

Natural initialization installs record `$81364C`, common sub-record `$81459C`, movement cursor `$132480`, handler `$195A42`, position `$420052C0`, speed `$04`, heading `$37`, phase timer `$0120`, and state zero. Palette bank `$13` receives the exact 64-byte block at `$122BF8`, and the spawn cursor advances to `$1316F4` without an unported route.

Type `$24` is a non-combat, two-part visual prop. Every active frame applies scroll compensation and direct velocity. State zero counts down for 288 updates. Its transition writes speed and heading word `$0537`, enters state one, and seeds cadence `$0808`; state one increments speed every ninth active tick. Freeze suppresses motion, counters, animation, retirement, and state changes while preserving both draw requests.

The two White draws use bucket-0 emitter `$13E21C`. The first uses fixed sprite `$0007E8AC`. The second reads the cursor-selected pointer from `$195B0E` and adds `$FDC00080` to the packed position as one 32-bit operation, so carry from the low half reaches the high half. Animation steps by 4 for signed speed below `$10`, by 12 for `$10..$7F`, and by 4 for signed-negative `$80..$FF`, then masks the cursor with `$003F`.

The direct damage fixture proves that P1 and P2 damage bits do not create score, kill, effect, sound, fire, or bullet activity. Signed short-axis `$E000` remains live. `$DE00` retires through White `freeEnemy` `$1627DC` before either draw request.

## Exact sparse table adoption

Five exact Build A windows add 172 declared bytes, all below `$200000`:

- `$122BF8 + $0040`: palette block
- `$1669BC + $0008`: low type-table entry `$24`
- `$1959DE + $0008`: run-length initializer stub
- `$195A28 + $001C`: long-form sub-record prototype
- `$195B0E + $0040`: sixteen-entry animated sprite table

The prototype's final word intentionally overlaps the first handler opcode at `[$195A42,$195A44)`, but the entire 28-byte read remains inside its single declared window. Every tracked White read fits wholly inside one window. The highest exclusive endpoint is `$195B4E`.

The exact executable identities are:

- Init `[$1959DE,$195A42)`: `fb397f6e7ae41fadb713880902857925b8209f910900840060383e04abbc0b41`
- Handler `[$195A42,$195B0E)`: `9b0c498bdb4ac423f98908975732d06775dead684f4bcc7597a307da3814679b`

The regenerated canonical JSON identity is SHA-256 `72599d6a78d2e78599247bfe008bc938e250d5cbc0647e04063ef0555a559e28`. Current cardinalities are:

- Global: 1,857 windows and 663,301 bytes
- White: 903 windows and 205,504 bytes
- White world runtime: 201 windows
- Overlap pairs: 80
- Historical Black: 950 windows and 457,529 bytes
- Black runtime projection: 954 windows and 457,797 bytes

Only current generated-table identity and cardinality pins changed. Historical identities, values, ledger prose, and overlap accounting remain unchanged. Existing exported Type `$24` assets already cover the identical White pointers, so no new art harvest was added.

## Focused verification

Tables were regenerated in the required order:

1. `python games/ddpdoj/tools/export-tables.py`
2. `node games/ddpdoj/tools/export-web.mjs`
3. `python games/ddpdoj/tools/export-tables.py --verify`

The final verifier reported 100 reachable spawn templates, 1,857 ROM windows, 663,301 declared bytes, and `VERIFY OK`.

The explicit serial compatibility command covered only:

- `games/ddpdoj/tests/white-stage1-enemy24.test.js`
- `games/ddpdoj/tests/w36handlers.test.js`
- `games/ddpdoj/tests/edition-profile.test.js`

Result: 38/38 tests passed. Direct Type `$24` coverage remains exactly three combined tests: descriptors, executable identity, sparse authority, palette install, and natural spawn; transition, freeze, both native draws, table-selected art, and 32-bit tail offset; and signed retirement plus the native absence of damage and scoring ownership.

A final `npm run typecheck` passed. `git diff --check` passed. White Label remains disabled and unpublished.
