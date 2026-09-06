# Task #280: White Label Stage 1 Type $89

Status: **green for the focused source and table acceptance set**. White Label now runs the natural Type `$89` Stage 1 enemy through the mature Black Label algorithm with edition-private initialization, movement, aiming, paired fire, bullet continuation, combat ownership, effects, and retirement.

## Shared algorithm and private resources

Type `$89` now has canonical, recursively frozen Black and White descriptors. Initializer and handler map construction validate exact descriptor identity before gameplay mutation or cartridge access. Black keeps its static routes while the White world removes those routes and installs its own:

| Resource | Black Label | White Label |
| --- | ---: | ---: |
| Init stub | `$277270` | `$176312` |
| Init body | `$277278` | `$17631A` |
| Handler | `$27733E` | `$1763E0` |
| Heading art | `$272E7A` | `$171ECE` |
| Paired fan | `$2732FA` | `$17234E` |
| Aim entry | `$24203E` | `$142378` |
| Aim slew | `$242190` | `$1424CA` |
| Emitter dispatch | `$27829C` | `$17733A` |
| Bullet entry | `$2813F0` | `$180474` |
| Bullet call sites | `$27745C`, `$277464` | `$1764FE`, `$176506` |
| Effect remap | `$278320` | `$1773BE` |
| Death sound | `$28C25A` | `$18AD80` |
| Free-enemy entry | `$263762` | `$1627DC` |

The implementation remains one shared Type `$89` algorithm selected by edition-owned resources. White kind `$06` now resolves through initializer `$1815B4` and stores authentic continuation `$1815E8`; its algorithmic equivalents remain the mature Black routines `$282620` and `$282654`.

## Natural White route

The direct gameplay fixture spawns the authentic record at `$1311FC`:

```text
record bytes:       01 1B 00 00 89 01 10 51
auxiliary cell:     $1317AE = $05FE
auxiliary base:     $13170C
resource base:      $131852
movement root:      $131E50
movement cursor:    $131E56
initial position:   $7580 / $1E00 before scroll adjustment
initial heading:    $60
dispatch row:       $17D50C
init stub/body:     $176312 / $17631A
handler:            $1763E0
sub-record:         $81459C
```

Natural initialization produces position `$7580/$1600` after scroll adjustment, HP `$0480`, speed `$10`, heading `$60`, palette `$0E`, and animation word `$0004`. The late Stage 0 HP branch remains intact.

One live frame exercises White Aim64 and slew, changes the heading sprite through `$171ECE`, dispatches one native emitter request, indexes one eight-byte paired-fan row, and spawns two bank-A kind `$06` bullets at White call sites `$1764FE` and `$176506`. The first bullet-driver frame installs continuation `$1815E8`; the next dispatches through it while both bullets remain live and move.

The lethal P2 route preserves native ownership: kill event `[0x34, 0x08]`, zero P1 score, `$35` P2 score, Pool-A kind `$08`, Pool-B kind `$0C`, White effect remap `$1773BE`, death sound `$18AD80`, and ordinary record and sub-record retirement.

## Exact sparse table adoption

Nine exact Build A windows add 480 declared bytes, all below `$200000`:

- `$171ECE + $0080`: heading-art table
- `$17234E + $0100`: paired-fan vectors
- `$176312 + $0008`: run-length initializer stub
- `$1763AE + $0032`: palette and prototypes
- `$17D50C + $0008`: high type-table row `$89`
- `$18062A + $0004`: kind `$06` spawn-init pointer
- `$180956 + $0004`: kind `$06` template pointer
- `$180A48 + $0012`: complete kind `$06` template and run-init
- `$180FE8 + $0004`: kind `$06` behavior pointer

All nine windows are disjoint. The exact half-open executable identities are:

- Init `[$176312,$1763E0)`: `c173ffefab1a57da8b6a1007f42565a636a4a5bce0e1e9621202b586ca4bfae1`
- Handler `[$1763E0,$1765B4)`: `447b057b4dd401052b5c0b178370968f9116836c59bdb71f71dea012c29cec97`

The regenerated canonical JSON identity is SHA-256 `d2374d899ef5d3095b0d47151df079ebe3ece7633bcbd9e812b6158b6f6d8138`. Current cardinalities are:

- Global: 1,833 windows and 662,425 bytes
- White: 879 windows and 204,628 bytes
- White world runtime: 177 windows
- White bullet runtime: 55 windows
- Overlap pairs: 80
- Historical Black: 950 windows and 457,529 bytes

Only current generated-table identity and cardinality pins changed. Historical identities, values, and overlap accounting remain unchanged.

## Focused verification

Tables were regenerated in the required order:

1. `python games/ddpdoj/tools/export-tables.py`
2. `node games/ddpdoj/tools/export-web.mjs`
3. `python games/ddpdoj/tools/export-tables.py --verify`

The final verifier reported 100 reachable spawn templates, 1,833 ROM windows, 662,425 declared bytes, and `VERIFY OK`.

The explicit serial acceptance command covered only:

- `games/ddpdoj/tests/white-stage1-enemy89.test.js`
- `games/ddpdoj/tests/white-bullets.test.js`
- `games/ddpdoj/tests/edition-profile.test.js`

Result: 24/24 tests passed in 16.1 seconds. Type `$89` direct coverage is exactly three combined tests: descriptor, manifest, and natural spawn; one live paired-fire and bullet-continuation frame; and lethal P2 ownership.

`npm run typecheck` passed. White Label remains disabled and unpublished.
