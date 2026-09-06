# Task #279: White Label Stage 1 Type $82

Status: **green for the focused source and table acceptance set**. White Label now runs the natural Type `$82` Stage 1 enemy through the mature Black Label algorithm with edition-private dispatch, resources, drawing, combat, and retirement.

## Shared algorithm and private resources

Type `$82` now has canonical, recursively frozen Black and White descriptors. Initializer and handler map construction validate exact descriptor identity before gameplay side effects. Black keeps its static routes while the White world removes those routes and installs its own:

| Resource | Black Label | White Label |
| --- | ---: | ---: |
| Init stub | `$274622` | `$173676` |
| Init body | `$27462A` | `$17367E` |
| Handler | `$2747C6` | `$17381A` |
| Zoom emitter | `$23DBCA` | `$13DF18` |
| Zoom scale | `$23E54A` | `$13E898` |
| Bullet generator | `$281484` | `$1804D0` |
| Bullet call site | `$274ACC` | `$173B20` |
| Death sound | `$28C274` | `$18AD9A` |
| Free-enemy entry | `$263762` | `$1627DC` |

The implemented paths remain one shared Type `$82` algorithm selected by edition-owned resources. Cartridge addresses and call sites differ. The still-counted primary fan also has a genuine parameter deviation: White uses D0 immediates `$0005000C` and `$FFFF000D`, while Black uses `$0003000C` and `$FFFD000D`. Those speed biases must become descriptor-owned when that unresolved fan is translated; this slice does not claim to port it.

## Natural White route

The direct gameplay fixture spawns the authentic record at `$13106C`:

```text
record bytes:       00 E3 00 0E 82 00 00 3F
auxiliary cells:    $13178A = $0424, $13178C = $0456
movement root:      $131C76
movement cursor:    $131C7E
dispatch row:       $17D4D4
init stub/body:     $173676 / $17367E
handler:            $17381A
cue cursor:         $1737FC
sub-record:         $81459C
body art:           $1735FC
HP and floor:       $0200 / $0200
palette pair:       $0C / $13
```

A live frame advances the cue by 14 bytes, selects Aim64 heading art, emits the body, heading, and alternate sprites, and creates kind `$07` through generator `$1804D0`. White zoom `$13DF18` is validated against White scale table `$13E898`. The unresolved primary fan remains dormant on that frame, so its existing single counted note is not expanded into duplicate coverage.

The lethal P2 route preserves native ownership: kill event `[0x42, 0x08]`, zero P1 score, `$43` P2 score, effects `$0D` and `$08` through White sites `$173B54` and `$173B82`, pool-B allocator `$187B40`, sound `$18AD9A`, and ordinary `freeEnemy` retirement.

## Exact sparse table adoption

Four exact Build A windows add 158 declared bytes, all below `$200000`:

- `$173676 + $0008`: run-length initializer stub
- `$173794 + $0070`: palette and prototypes
- `$1737FC + $001E`: cue thresholds
- `$17D4D4 + $0008`: high type-table row `$82`

The cue window overlaps the palette/prototype window by exactly eight bytes. The exact half-open executable identities are:

- Init `[$173676,$17381A)`: `32a2859d0e0c79a09c0e8e5569b516cea97470865a271800ff0a0f974d4b9f9b`
- Handler `[$17381A,$173BC0)`: `c871a325f02618695ad45556fb92121229d0220176cd9b0546495f14f6725b65`

The regenerated canonical JSON identity is SHA-256 `4dbe429c7f6f87e3bc8f3cb0dfd7023eb6f7a47236e0a57ca3f6ffb57b12eb90`. Current cardinalities are:

- Global: 1,824 windows and 661,945 bytes
- White: 870 windows and 204,148 bytes
- Overlap pairs: 80
- Historical Black: 950 windows and 457,529 bytes

Only current generated-table identity and cardinality pins changed. Historical identities, the historical overlap count, unrelated stream counts, addresses, and disassembly bytes remain unchanged.

## Focused verification

Tables were regenerated in the required order:

1. `python games/ddpdoj/tools/export-tables.py`
2. `node games/ddpdoj/tools/export-web.mjs`
3. `python games/ddpdoj/tools/export-tables.py --verify`

The final verifier reported 100 reachable spawn templates, 1,824 ROM windows, 661,945 declared bytes, and `VERIFY OK`.

The explicit serial acceptance command covered only:

- `games/ddpdoj/tests/white-stage1-enemy82.test.js`
- `games/ddpdoj/tests/edition-profile.test.js`
- `games/ddpdoj/tests/w428cuescript.test.js`

Result: 28/28 tests passed in 23.4 seconds. Type `$82` direct coverage is four combined tests: descriptor and executable identity, natural spawn, one live firing frame, and lethal P2 ownership. The overlap ledger test was included only because Task #279 introduces one exact new overlap pair.

`npm run typecheck` passed. A final `python games/ddpdoj/tools/export-tables.py --verify` also reported `VERIFY OK`. White Label remains disabled and unpublished.
